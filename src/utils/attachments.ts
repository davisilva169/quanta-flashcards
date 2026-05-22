/**
 * ATTACHMENT UTILITIES
 * ============================================================================
 * Pure functions and one React hook that support the attachment lifecycle:
 *
 *   1. Validation        — accept the file or reject it with a reason.
 *   2. Blob/base64       — IO-edge conversion (DB stores Blob, JSON stores
 *                          base64 data URL).
 *   3. Markers           — find / replace / rewrite the `![[att_id]]` markers
 *                          embedded in card content.
 *   4. Render            — rewrite a card's text so `react-markdown` renders
 *                          attachments as <img> with a recognizable src.
 *   5. useObjectUrl      — build a runtime URL from a Blob with automatic
 *                          revoke on unmount (the one piece of memory hygiene
 *                          that's easy to get wrong).
 *
 * No React, no Dexie — these are leaf helpers. The only React import is the
 * useObjectUrl hook at the bottom; it's kept in this file so the marker
 * scheme and its consumer hook stay co-located.
 * ============================================================================
 */

import { useMemo } from 'react';
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  ACCEPTED_AUDIO_MIME,
  ACCEPTED_IMAGE_MIME,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_LABEL,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
  type Attachment,
  type AttachmentKind,
} from '@/types/attachment';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validation
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Gatekeeper for every image input — drag/drop, paste, file picker all funnel
 * here. Returns a tagged result instead of throwing so the UI can render the
 * reason inline without try/catch.
 */
export function validateImageFile(file: File): ValidationResult {
  if (!file || file.size === 0) {
    return { ok: false, reason: 'Arquivo vazio ou inválido.' };
  }
  if (!ACCEPTED_IMAGE_MIME.includes(file.type)) {
    return {
      ok: false,
      reason: `Formato não aceito (${file.type || 'desconhecido'}). Use PNG, JPG, WEBP ou GIF.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Imagem muito grande (${mb} MB). Máximo: ${MAX_IMAGE_LABEL}.`,
    };
  }
  return { ok: true };
}

/**
 * Same shape as `validateImageFile`, but for audio. Has an extension-based
 * fallback because Windows + Chromium frequently hand us audio files with
 * `File.type === ''` (especially for WAV and M4A from the file picker).
 *
 * Rule:
 *   - If MIME is present, it MUST be on the whitelist. No leniency.
 *   - If MIME is empty/missing, we accept the file only if the extension
 *     is on the audio extension whitelist. Belt-and-suspenders: a user
 *     can't rename a .exe to .mp3 and slip through (the OS would still
 *     report a non-empty, non-audio MIME for that, hitting the first
 *     check).
 */
export function validateAudioFile(file: File): ValidationResult {
  if (!file || file.size === 0) {
    return { ok: false, reason: 'Arquivo vazio ou inválido.' };
  }
  const mime = file.type;
  let typeOk = false;
  if (mime) {
    typeOk = ACCEPTED_AUDIO_MIME.includes(mime);
  } else {
    // Fallback: MIME missing (common on Windows for audio). Sniff the
    // extension. This only runs when MIME is empty — never overrides a
    // valid but unsupported MIME.
    const name = file.name.toLowerCase();
    const dot = name.lastIndexOf('.');
    if (dot !== -1) {
      const ext = name.slice(dot);
      typeOk = ACCEPTED_AUDIO_EXTENSIONS.includes(ext);
    }
  }
  if (!typeOk) {
    return {
      ok: false,
      reason: `Formato não aceito (${mime || 'desconhecido'}). Use MP3, WAV, OGG, M4A ou WebM.`,
    };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Áudio muito grande (${mb} MB). Máximo: ${MAX_AUDIO_LABEL}.`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Blob ↔ base64
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Blob into a base64 data URL (`data:<mime>;base64,<...>`). Used at
 * export time to serialize attachments into JSON. Returns a Promise because
 * FileReader is async.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result;
      if (typeof result !== 'string') {
        reject(new Error('Leitura do arquivo falhou (resultado não é string).'));
        return;
      }
      resolve(result);
    };
    r.onerror = () => reject(r.error ?? new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(blob);
  });
}

/**
 * Convert a base64 data URL back to a Blob. Used at import time.
 *
 * We use the `fetch` trick (URL → Response → blob) rather than manual atob +
 * Uint8Array because it's well-tested across Chromium versions and handles
 * the data URL parsing for free. Throws on malformed input — caller is
 * expected to surface the error to the user.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Conteúdo de imagem inválido (não é data URL).');
  }
  const res = await fetch(dataUrl);
  return res.blob();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Markers — the `![[att_id]]` referencing scheme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matches `![[att_xxxxxxxxx]]` markers in card content, OR the extended
 * form `![[att_xxxxxxxxx|300]]` where 300 is the desired render width in
 * pixels. Groups:
 *   1: attachment id (with `att_` prefix)
 *   2: full `|width` segment including the pipe (or undefined)
 *   3: just the width digits (or undefined)
 *
 * The width form is a deliberate echo of the Obsidian/MediaWiki `[[file|w]]`
 * pattern. Keeping it inside the marker means width travels with the card
 * content (no separate per-card sidecar) and exports/imports for free.
 */
export const ATT_MARKER_REGEX = /!\[\[(att_[A-Za-z0-9_-]+)(\|(\d+))?\]\]/g;

/** Build a marker string from an attachment id, optionally with a width. */
export function buildAttMarker(id: string, width?: number | null): string {
  if (width && width > 0) {
    return `![[${id}|${Math.round(width)}]]`;
  }
  return `![[${id}]]`;
}

/** All attachment ids referenced by a piece of card content, in document order. */
export function extractAttachmentIds(content: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  const re = new RegExp(ATT_MARKER_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Rewrite each `![[oldId]]` to `![[newId]]` using the given map. Ids not in
 * the map are left untouched (the render path turns those into placeholders).
 *
 * Implementation uses split/join instead of regex replace so the marker
 * delimiters are matched literally — no escaping concerns for the id.
 */
export function remapAttachmentIds(
  content: string,
  idMap: Map<string, string>,
): string {
  if (!content || idMap.size === 0) return content;
  let out = content;
  for (const [oldId, newId] of idMap) {
    out = out.split(buildAttMarker(oldId)).join(buildAttMarker(newId));
  }
  return out;
}

/**
 * Remove every `![[id]]` / `![[id|w]]` occurrence for the given id from
 * the content, collapsing the surrounding whitespace so we don't leave
 * orphan blank lines. Used when the user deletes an attachment in the editor.
 */
export function stripAttachmentMarker(content: string, id: string): string {
  if (!content) return content;
  // Match this specific id only, with optional width. Escape the literal
  // pieces (the id can contain `_` and `-`, both regex-safe).
  const re = new RegExp(`!\\[\\[${id}(\\|\\d+)?\\]\\]`, 'g');
  return content
    .replace(re, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Rewrite every `![[id]]` / `![[id|w]]` occurrence for the given id to use
 * the new width. Passing `null` or `0` removes the width segment entirely,
 * returning to the natural-size form `![[id]]`.
 *
 * Used by the editor's per-thumbnail width input: change the number, every
 * marker referencing that attachment in front and back picks up the new
 * size in one go.
 */
export function setAttachmentWidth(
  content: string,
  id: string,
  width: number | null,
): string {
  if (!content) return content;
  const re = new RegExp(`!\\[\\[${id}(\\|\\d+)?\\]\\]`, 'g');
  return content.replace(re, buildAttMarker(id, width));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Render transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom URL scheme for attachment images. The render component recognizes
 * `src` values starting with this prefix and resolves them to runtime
 * `URL.createObjectURL(blob)` values — these are EPHEMERAL and never stored.
 *
 * Why a custom scheme: react-markdown doesn't pass the original marker text
 * through to `components.img`. We need a way to recover the attachment id
 * from the `<img>` props, and putting it in `src` is the cleanest channel
 * (other than `alt`, which we'd rather leave for the filename). The
 * optional width is appended as a query string (`?w=300`).
 */
export const ATT_URL_SCHEME = 'quanta-attachment://';

/** Build the in-content image src for a given attachment id and optional width. */
export function buildAttUrl(id: string, width?: number | null): string {
  if (width && width > 0) {
    return `${ATT_URL_SCHEME}${id}?w=${Math.round(width)}`;
  }
  return `${ATT_URL_SCHEME}${id}`;
}

/**
 * Extract the attachment id (and optional width) from a custom-scheme URL.
 * Returns null if the URL doesn't match the scheme.
 */
export function parseAttUrl(
  src: string | undefined,
): { id: string; width: number | null } | null {
  if (!src || !src.startsWith(ATT_URL_SCHEME)) return null;
  const body = src.slice(ATT_URL_SCHEME.length);
  const qIdx = body.indexOf('?');
  if (qIdx === -1) {
    return { id: body, width: null };
  }
  const id = body.slice(0, qIdx);
  const query = body.slice(qIdx + 1);
  // Cheap query parser — we only care about `w=<digits>`.
  const wMatch = query.match(/(?:^|&)w=(\d+)/);
  const width = wMatch ? Number(wMatch[1]) : null;
  return { id, width };
}

/**
 * Rewrite all `![[att_id]]` / `![[att_id|w]]` markers into standard
 * markdown image syntax using our custom URL scheme. The filename is used
 * as alt text. Markers whose id is not in `attachmentsById` are still
 * rewritten — the render component decides what to show (a placeholder).
 */
export function rewriteAttachmentMarkers(
  content: string,
  attachmentsById: Map<string, Attachment>,
): string {
  if (!content) return content;
  return content.replace(
    ATT_MARKER_REGEX,
    (_full, id: string, _pipe, widthStr?: string) => {
      const att = attachmentsById.get(id);
      const alt = att?.filename ?? 'imagem ausente';
      const safeAlt = alt.replace(/[\[\]()]/g, ' ').trim() || 'imagem';
      const width = widthStr ? Number(widthStr) : null;
      return `![${safeAlt}](${buildAttUrl(id, width)})`;
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. useObjectUrl — runtime URL, cached per Blob, never revoked from React
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-scope cache that maps each Blob to the one Object URL we created
 * for it. We never make a second URL for the same Blob, and we never revoke
 * any URL from the React effect lifecycle.
 *
 * `WeakMap` keys are held weakly, so when the Blob itself is garbage-
 * collected (no more references from React state, attachment list, etc),
 * the map entry vanishes automatically. The URL string we leaked is then
 * orphan — its 50ish bytes are negligible.
 *
 * ## Why we don't revoke
 *
 * Earlier versions called `URL.revokeObjectURL(url)` in the effect cleanup.
 * That broke audio playback (and intermittently images) because of React 18
 * StrictMode DEV double-invocation:
 *
 *   1. Mount  → `useMemo` creates `blob:abc`. Effect schedules cleanup.
 *   2. Cleanup (StrictMode simulated unmount) → revokes `blob:abc`.
 *   3. Mount again (StrictMode simulated remount) → `useMemo` cache hit,
 *      returns the SAME revoked string. New effect schedules new cleanup.
 *   4. Component stays mounted with `<audio src="blob:abc">`, but the URL
 *      is dead. Chromium plays a few seconds (from the cache) then stops.
 *
 * `setTimeout(revoke, 0)` mitigated this for images (the pixel was already
 * painted before the timer fired) but not for audio that has to read the
 * stream continuously throughout playback.
 *
 * The robust fix is to stop tying URL lifecycle to React effects. We give
 * each Blob ONE URL for its entire JavaScript life, regardless of how many
 * components observe it or how often they mount/unmount. When the Blob
 * itself is collected, the underlying URL becomes unreachable and the
 * browser can recycle the internal Blob reference.
 *
 * ## Memory cost
 *
 * In practice negligible. The Blob is already living in the attachments
 * array (held by parent state). The URL is just a `blob:http://localhost/uuid`
 * string. There's no per-component growth: 10 reviews of the same card all
 * share the same URL.
 *
 * If a long-running session ever shows a real leak from this, the next
 * step would be a `FinalizationRegistry`-based scheme — but that's not
 * needed today.
 */
const objectUrlCache = new WeakMap<Blob, string>();

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  return useMemo(() => {
    if (!blob) return null;
    const cached = objectUrlCache.get(blob);
    if (cached) return cached;
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(blob, url);
    return url;
  }, [blob]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Convenience: turn a File into a brand-new attachment (no DB write yet)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an in-memory Attachment from a File. NO database side effect — the
 * editor accumulates these in local state and persists them in a single
 * transaction at save time. That's how we avoid orphaned rows when the user
 * cancels a card creation.
 *
 * @param file              the File to wrap. The File IS a Blob, so we use
 *                          it directly (no extra copy).
 * @param options.id        id generator output (e.g. `attUid()`).
 * @param options.cardId    real cardId for edit flows; empty string for
 *                          create flows (the page assigns it at save time).
 * @param options.kind      'image' or 'audio'. Determines the renderer
 *                          dispatch in LatexMarkdown.
 * @param options.now       optional timestamp override (tests).
 */
export function fileToAttachment(
  file: File,
  options: {
    id: string;
    cardId: string;
    kind: AttachmentKind;
    now?: number;
  },
): Attachment {
  const now = options.now ?? Date.now();
  return {
    id: options.id,
    cardId: options.cardId,
    type: options.kind,
    mimeType: file.type,
    filename: file.name || (options.kind === 'audio' ? 'áudio' : 'imagem'),
    size: file.size,
    data: file,
    createdAt: now,
    updatedAt: now,
  };
}
