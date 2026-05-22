import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { ImageOff, Music, Trash2 } from 'lucide-react';
import type { Attachment } from '@/types/attachment';
import { ATT_MARKER_REGEX, useObjectUrl } from '@/utils/attachments';

/**
 * LATEX-MARKDOWN RENDERER WITH NATIVE ATTACHMENT SUPPORT
 * ============================================================================
 *
 * Why this component is NOT just a thin wrapper around react-markdown:
 *
 *   We want `![[att_id]]` markers in card content to render as actual images,
 *   resolved against a list of Attachment Blobs. The naive route — pre-process
 *   the markers into `![alt](quanta-attachment://att_id)` and hijack
 *   `components.img` — fails in react-markdown v9 because the library's
 *   default `urlTransform` SANITIZES non-standard protocols (anything not
 *   http/https/mailto/tel/data/etc) by rewriting the src to an empty string.
 *   By the time our `components.img` runs, `src === ""` and we have no way
 *   to recover the attachment id. The browser then paints the broken-image
 *   icon over the alt text — which is exactly the bug the user kept seeing.
 *
 *   Solution: split the content by `![[att_id]]` markers BEFORE handing
 *   anything to react-markdown. Each text segment goes through
 *   <ReactMarkdown> independently (LaTeX, GFM, code, lists, links all still
 *   work). Each image marker becomes a real React component
 *   (<AttachmentImage> or <EditableAttachmentImage>), which receives the
 *   resolved Attachment directly and creates a runtime Object URL from
 *   the Blob — no fake protocol ever exists, so nothing can sanitize it
 *   away.
 *
 * Consequence:
 *
 *   Images are always block-level — they render between text segments,
 *   never inline inside a paragraph. The marker SHOULD be on its own line
 *   (the editor's insertion helper does that automatically, surrounding
 *   with `\n\n`). If the user types `texto ![[id]] texto` on one line,
 *   the inline-ness is lost: front becomes two paragraphs sandwiching the
 *   image. This is the same constraint Obsidian uses for embed syntax
 *   and matches how flashcard images typically work anyway (one image,
 *   its own block).
 *
 * Theme parity:
 *
 *   Every image is wrapped with semantic token classes (border-divider,
 *   shadow-card). In editor preview mode, the image gains a trash icon
 *   and a resize handle that appear on hover. In review mode, the image
 *   becomes a button that opens the lightbox.
 * ============================================================================
 */

export interface EditableAttachments {
  /** Called when the user finishes dragging the resize handle. */
  onResize: (id: string, width: number | null) => void;
  /** Called when the user clicks the trash icon over the image. */
  onDelete: (id: string) => void;
}

interface Props {
  content: string;
  className?: string;
  /** Attachments referenced by the content. Optional — markers without a
   *  resolvable attachment render as a "missing image" placeholder. */
  attachments?: Attachment[];
  /** Review-mode: click on image opens a lightbox. Ignored when
   *  `editableAttachments` is set (editor mode takes priority). */
  onImageClick?: (att: Attachment) => void;
  /** Editor-mode: makes images interactive (trash + resize handle). */
  editableAttachments?: EditableAttachments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment model
// ─────────────────────────────────────────────────────────────────────────────

type Segment =
  | { type: 'text'; text: string }
  | { type: 'image'; id: string; width: number | null };

/**
 * Split content at every `![[att_id]]` / `![[att_id|N]]` marker, keeping
 * the markers as `image` segments and everything else as `text` segments.
 *
 * Adjacent newlines around a marker are trimmed off the text segments
 * (since the image takes their place visually as a block). Empty text
 * segments are dropped.
 */
function splitIntoSegments(content: string): Segment[] {
  if (!content) return [];
  const segments: Segment[] = [];
  const re = new RegExp(ATT_MARKER_REGEX.source, 'g');
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index);
      // Trim trailing blank lines that immediately precede the marker —
      // they were the editor's `\n\n` separator. We re-add spacing through
      // the wrapper's CSS instead.
      const trimmed = text.replace(/\n+$/, '');
      if (trimmed.length > 0) {
        segments.push({ type: 'text', text: trimmed });
      }
    }
    segments.push({
      type: 'image',
      id: m[1],
      width: m[3] ? Number(m[3]) : null,
    });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    // Trim leading blank lines for the same reason.
    const trimmed = tail.replace(/^\n+/, '');
    if (trimmed.length > 0) {
      segments.push({ type: 'text', text: trimmed });
    }
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function LatexMarkdown({
  content,
  className = '',
  attachments,
  onImageClick,
  editableAttachments,
}: Props) {
  // id → Attachment map for O(1) lookup. Memoized on array ref.
  const attachmentsById = useMemo(() => {
    const map = new Map<string, Attachment>();
    for (const a of attachments ?? []) map.set(a.id, a);
    return map;
  }, [attachments]);

  const segments = useMemo(() => splitIntoSegments(content), [content]);

  // Dev-time sanity check: if there ARE markers in the text but no
  // attachments were passed, that's almost certainly a wiring bug —
  // attachments forgotten on the parent's `<LatexMarkdown>` call.
  // Logged once per content change so it's not spammy.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasMarkers = segments.some(s => s.type === 'image');
    if (hasMarkers && (!attachments || attachments.length === 0)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[LatexMarkdown] content references attachments but none were passed. ' +
          'Check the parent component is forwarding the `attachments` prop.',
      );
    }
  }, [segments, attachments]);

  // Empty content → placeholder. (Card editor relies on this to remind the
  // user that they have nothing typed yet.)
  if (segments.length === 0) {
    return (
      <div className={`prose-quanta ${className}`}>
        <ReactMarkdown>{'*Sem conteúdo.*'}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={`prose-quanta ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return (
            <ReactMarkdown
              key={`t-${i}`}
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
            >
              {seg.text}
            </ReactMarkdown>
          );
        }
        // attachment segment — type comes from the attachment itself, not
        // from the marker. The marker syntax `![[att_id]]` is identical
        // for images and audio; the renderer dispatches based on
        // `att.type`. Width on the marker is image-only — audio ignores it.
        const att = attachmentsById.get(seg.id);
        if (!att) {
          return <MissingAttachment key={`m-${i}-${seg.id}`} id={seg.id} />;
        }
        if (att.type === 'audio') {
          if (editableAttachments) {
            return (
              <EditableAttachmentAudio
                key={`a-${i}-${seg.id}`}
                att={att}
                onDelete={editableAttachments.onDelete}
              />
            );
          }
          return <AttachmentAudio key={`a-${i}-${seg.id}`} att={att} />;
        }
        // type === 'image'
        if (editableAttachments) {
          return (
            <EditableAttachmentImage
              key={`i-${i}-${seg.id}`}
              att={att}
              width={seg.width}
              onResize={editableAttachments.onResize}
              onDelete={editableAttachments.onDelete}
            />
          );
        }
        return (
          <AttachmentImage
            key={`i-${i}-${seg.id}`}
            att={att}
            width={seg.width}
            onClick={onImageClick}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentImage — read-only render (review, rush, lightbox triggers)
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentImage({
  att,
  width,
  onClick,
}: {
  att: Attachment;
  width: number | null;
  onClick?: (att: Attachment) => void;
}) {
  const url = useObjectUrl(att.data);
  const altText = att.filename ?? 'imagem';

  const sizingStyle: React.CSSProperties | undefined =
    width && width > 0 ? { width: `${width}px`, maxWidth: '100%' } : undefined;

  // Loading placeholder (rare with useMemo-driven Object URLs but defensive).
  if (!url) {
    return (
      <div
        className="my-2 h-32 max-w-full rounded-lg border border-dashed border-divider bg-surface-2"
        style={sizingStyle}
        aria-hidden="true"
      />
    );
  }

  const imgEl = (
    <img
      src={url}
      alt={altText}
      data-attachment-id={att.id}
      style={sizingStyle}
      className="my-2 block max-h-[60vh] max-w-full rounded-lg border border-divider shadow-card"
    />
  );

  if (!onClick) return imgEl;

  return (
    <button
      type="button"
      onClick={() => onClick(att)}
      className="my-2 inline-block cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title="Clique para ampliar"
      aria-label={`Ampliar imagem: ${altText}`}
    >
      <img
        src={url}
        alt={altText}
        data-attachment-id={att.id}
        style={sizingStyle}
        className="block max-h-[60vh] max-w-full rounded-lg border border-divider shadow-card"
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditableAttachmentImage — Anki-style edit affordances in the preview
// ─────────────────────────────────────────────────────────────────────────────

function EditableAttachmentImage({
  att,
  width,
  onResize,
  onDelete,
}: {
  att: Attachment;
  width: number | null;
  onResize: (id: string, width: number | null) => void;
  onDelete: (id: string) => void;
}) {
  const url = useObjectUrl(att.data);
  const altText = att.filename ?? 'imagem';
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(width);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Keep `liveWidth` in sync if the underlying marker width changes from
  // outside the drag (e.g. user typed `|350` in the textarea).
  useEffect(() => {
    setLiveWidth(width);
  }, [width]);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const startWidth = img.getBoundingClientRect().width;
    dragRef.current = { startX: e.clientX, startWidth };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const next = Math.round(
        Math.min(Math.max(dragRef.current.startWidth + delta, 40), 2000),
      );
      setLiveWidth(next);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragRef.current = null;
      if (imgRef.current) {
        const w = Math.round(imgRef.current.getBoundingClientRect().width);
        const clamped = Math.min(Math.max(w, 40), 2000);
        onResize(att.id, clamped);
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const sizingStyle: React.CSSProperties =
    liveWidth && liveWidth > 0
      ? { width: `${liveWidth}px`, maxWidth: '100%' }
      : { maxWidth: '100%' };

  if (!url) {
    return (
      <div
        className="my-2 h-32 max-w-full rounded-lg border border-dashed border-divider bg-surface-2"
        style={sizingStyle}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="group relative my-2 inline-block max-w-full align-top"
      style={sizingStyle}
    >
      <img
        ref={imgRef}
        src={url}
        alt={altText}
        draggable={false}
        data-attachment-id={att.id}
        className="block max-h-[60vh] w-full select-none rounded-lg border border-divider shadow-card"
      />

      {/* Trash icon — top-right */}
      <button
        type="button"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(att.id);
        }}
        title="Remover imagem"
        aria-label="Remover imagem"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-elevated/90 text-danger-fg opacity-0 shadow-card transition-opacity hover:bg-danger-soft group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>

      {/* Resize handle — bottom-right */}
      <span
        onMouseDown={handleResizeStart}
        role="slider"
        aria-label="Redimensionar imagem"
        title="Arraste para redimensionar"
        className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm bg-accent/80 opacity-0 shadow transition-opacity group-hover:opacity-100"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentAudio — read-only player (review, rush, listings)
// ─────────────────────────────────────────────────────────────────────────────
//
// Native <audio> element wrapped in a themed container. Native controls
// expose play/pause, scrubbing, volume, and keyboard accessibility for
// free; `controlsList="nodownload noremoteplayback"` hides the extras
// that don't make sense inside a flashcard (download button, cast).
//
// `preload="metadata"` fetches the duration/track info but NOT the bytes
// — actual decoding happens on first play. Important for cards with many
// audio attachments where eager-loading would balloon memory.
//
// We deliberately do NOT set autoplay anywhere. Chromium would block it
// without prior user interaction anyway, and silent failures are worse
// than an explicit play click.

function AttachmentAudio({ att }: { att: Attachment }) {
  const url = useObjectUrl(att.data);
  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border border-divider bg-card p-3 shadow-card">
      <Music size={18} className="shrink-0 text-accent-fg" />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium text-primary"
          title={att.filename}
        >
          {att.filename}
        </div>
        {url ? (
          <audio
            src={url}
            controls
            preload="metadata"
            controlsList="nodownload noremoteplayback"
            className="mt-1 w-full"
            data-attachment-id={att.id}
          />
        ) : (
          <div
            className="mt-1 h-10 w-full rounded bg-surface-2"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditableAttachmentAudio — same as above plus a trash button.
// ─────────────────────────────────────────────────────────────────────────────
//
// No resize handle: audio doesn't have a visual width concept. The trash
// button is always visible (unlike the image variant where it's hover-
// reveal) because the player itself already has the visual weight to
// absorb the extra icon — hiding it would be a hunt-and-peck UX.

function EditableAttachmentAudio({
  att,
  onDelete,
}: {
  att: Attachment;
  onDelete: (id: string) => void;
}) {
  const url = useObjectUrl(att.data);
  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border border-divider bg-card p-3 shadow-card">
      <Music size={18} className="shrink-0 text-accent-fg" />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium text-primary"
          title={att.filename}
        >
          {att.filename}
        </div>
        {url ? (
          <audio
            src={url}
            controls
            preload="metadata"
            controlsList="nodownload noremoteplayback"
            className="mt-1 w-full"
            data-attachment-id={att.id}
          />
        ) : (
          <div
            className="mt-1 h-10 w-full rounded bg-surface-2"
            aria-hidden="true"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(att.id)}
        title="Remover áudio"
        aria-label="Remover áudio"
        className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger-fg"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MissingAttachment — friendly placeholder for unresolved references
// ─────────────────────────────────────────────────────────────────────────────

function MissingAttachment({ id }: { id: string }) {
  return (
    <div
      className="my-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-divider bg-surface-2 px-3 py-2 text-xs text-muted"
      title={`Anexo não encontrado: ${id}`}
    >
      <ImageOff size={14} className="shrink-0 text-faint" />
      Imagem ausente
    </div>
  );
}
