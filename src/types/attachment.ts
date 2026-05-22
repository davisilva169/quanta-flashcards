/**
 * ATTACHMENTS
 * ============================================================================
 * Generic media attached to a card. Designed so that image is the first
 * concrete type, and audio/TTS can be added later WITHOUT a schema migration
 * — the `type` field is already a union.
 *
 * Storage model:
 *   - `data` is a Blob in IndexedDB (native, no string overhead).
 *   - In export JSON it's serialized as a base64 data URL string. The two
 *     formats are converted at the IO boundary, never mixed at the type
 *     level (the in-memory type is always Blob).
 *
 * Reference model:
 *   - Cards reference attachments by id inline in their `front`/`back`
 *     using the Obsidian-style marker `![[att_id]]`. The marker is the
 *     ONLY link from card content to attachment; the DB enforces
 *     `attachment.cardId` separately so cascade deletes are cheap.
 *   - On render, the marker is rewritten to a data-URL-flavored markdown
 *     image so react-markdown handles it natively. See utils/attachments.ts.
 *
 * Limits:
 *   - 8 MB per image. Adjustable via MAX_IMAGE_BYTES below.
 *   - MIME whitelist; everything else is rejected at upload time.
 * ============================================================================
 */

export type AttachmentKind = 'image' | 'audio';

export interface Attachment {
  /** Always prefixed with `att_` for easy visual identification in markers. */
  id: string;
  /** FK to Flashcard.id. */
  cardId: string;
  type: AttachmentKind;
  /** e.g. 'image/png'. Whitelisted at validation. */
  mimeType: string;
  /** Original filename when uploaded. Used as the markdown alt text fallback. */
  filename: string;
  /** Size in bytes (matches Blob.size at creation time). */
  size: number;
  /** Binary payload. Blob in the DB; converted to/from base64 at the IO edges. */
  data: Blob;
  createdAt: number;
  updatedAt: number;
}

// ── Limits ───────────────────────────────────────────────────────────────────

/**
 * Maximum size, in bytes, of a single image attachment.
 *
 * 8 MB is between the 5 / 10 MB range Davi mentioned, and covers 99% of
 * technical diagrams / screenshots without inflating IndexedDB. Adjusting
 * this here is the ONLY change needed — UI, validation and export all read
 * from this constant.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Human-readable form of MAX_IMAGE_BYTES, for error messages. */
export const MAX_IMAGE_LABEL = '8 MB';

/**
 * MIME whitelist for image uploads. PNG / JPEG / WEBP / GIF cover the
 * physics-and-math diagram / screenshot / photo of textbook page use case.
 * Anything else is rejected before reaching IndexedDB.
 */
export const ACCEPTED_IMAGE_MIME: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/**
 * Accept attribute for `<input type="file">`. Mirrors ACCEPTED_IMAGE_MIME
 * but also accepts the `.jpg` extension for legacy file systems.
 */
export const ACCEPTED_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

// ── Audio limits ─────────────────────────────────────────────────────────────

/**
 * Maximum size, in bytes, of a single audio attachment.
 *
 * 25 MB covers ~25 minutes of MP3 at 128 kbps or a few minutes of WAV.
 * Plenty for narrations, dictation snippets, language-pronunciation
 * examples — the realistic flashcard use case. Larger files (lectures,
 * full podcasts) don't belong inside flashcards anyway.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_LABEL = '25 MB';

/**
 * MIME whitelist for audio uploads. Covers the formats Chromium decodes
 * natively (Electron uses Chromium), with explicit room for the Windows
 * variants of WAV that some uploaders advertise.
 *
 * Be aware that `File.type` from the OS is sometimes empty for audio
 * (especially WAV/M4A on Windows). The validator falls back to extension
 * sniffing when `type` is missing — see `validateAudioFile`.
 */
export const ACCEPTED_AUDIO_MIME: readonly string[] = [
  'audio/mpeg',     // MP3
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',      // M4A is technically MP4 audio
  'audio/x-m4a',
  'audio/webm',
];

/**
 * Extension whitelist used ONLY as a fallback when `File.type` is empty
 * (a common Windows quirk for audio files). We never accept by extension
 * alone if the MIME is present-but-unknown — that would let the user
 * sneak in arbitrary content with a fake extension.
 */
export const ACCEPTED_AUDIO_EXTENSIONS: readonly string[] = [
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.webm',
];

/** Accept attribute for the audio file picker. Combines MIMEs + extensions. */
export const ACCEPTED_AUDIO_ACCEPT =
  'audio/mpeg,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm';
