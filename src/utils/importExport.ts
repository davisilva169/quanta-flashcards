import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Settings, UserStats } from '@/types/stats';
import type { AttachmentKind } from '@/types/attachment';

/**
 * Schema version log:
 *   v1 — initial. No folders. Decks have no `folderId`.
 *   v2 — adds `folders[]` and `folderId` on decks. Backwards-compatible:
 *         importing a v1 file just means folders are empty and all decks
 *         become "loose" (folderId = null).
 *   v3 — adds `attachments[]`. Each attachment carries its binary payload as
 *         a base64 data URL string (`data: "data:image/png;base64,..."`),
 *         because JSON can't natively hold a Blob. The conversion to/from
 *         Blob happens in SettingsPage (the IO boundary). v1/v2 exports
 *         without `attachments` are tolerated as an empty list — the cards'
 *         `![[att_id]]` markers, if any, will render as "imagem ausente".
 */
export const SCHEMA_VERSION = 3;

/**
 * Wire format for attachments inside the JSON export. Mirrors the in-memory
 * Attachment, but `data` is a base64 data URL (string) instead of Blob.
 *
 * Kept structurally aligned with the deck-export's attachment record so we
 * can share the (de)serialization helpers between the two flows.
 */
export interface AttachmentExport {
  id: string;
  cardId: string;
  type: AttachmentKind;
  mimeType: string;
  filename: string;
  size: number;
  /** base64 data URL: `data:<mime>;base64,<bytes>` */
  data: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuantaExport {
  schemaVersion: number;
  exportedAt: number;
  decks: Deck[];
  /** Optional in v1 exports. */
  folders?: Folder[];
  /**
   * Cartões serializados verbatim — incluindo `clozeStates` quando
   * existir (cartões multi-cloze populados). JSON.stringify cobre tudo
   * por reflexão; o round-trip preserva o estado de SR por chave. Isso
   * é diferente do export de deck INDIVIDUAL, que zera deliberadamente
   * o progresso (ver `utils/deckExport.ts`).
   */
  cards: Flashcard[];
  /**
   * Logs serializados verbatim — incluindo `clozeKey` quando o log se
   * refere a uma chave específica (cartões multi-cloze). Para logs de
   * cartões clássicos, `clozeKey` é `undefined` e some no JSON.
   */
  reviewLogs: ReviewLog[];
  userStats: UserStats;
  settings: Settings;
  /** Optional in v1/v2 exports — treated as [] in those cases. */
  attachments?: AttachmentExport[];
}

export function buildExport(
  payload: Omit<QuantaExport, 'schemaVersion' | 'exportedAt'>,
): QuantaExport {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    ...payload,
  };
}

export function downloadJson(data: QuantaExport, filename = 'quanta-export.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reads, parses, and lightly normalizes an export file.
 * Throws on structural corruption; tolerant of missing optional fields
 * (folders, attachments, schemaVersion).
 */
export function readJsonFile(file: File): Promise<QuantaExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Arquivo JSON inválido.');
        }
        if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
          throw new Error('Estrutura inválida: faltam decks ou cards.');
        }

        // Tolerate v1/v2 exports (no schemaVersion / no folders / no
        // attachments / old "version" field).
        const normalized: QuantaExport = {
          schemaVersion: parsed.schemaVersion ?? parsed.version ?? 1,
          exportedAt: parsed.exportedAt ?? Date.now(),
          decks: parsed.decks,
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          cards: parsed.cards,
          reviewLogs: Array.isArray(parsed.reviewLogs) ? parsed.reviewLogs : [],
          userStats: parsed.userStats,
          settings: parsed.settings,
          attachments: Array.isArray(parsed.attachments)
            ? parsed.attachments
            : [],
        };

        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
