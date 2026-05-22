/**
 * SINGLE-DECK EXPORT / IMPORT
 * ============================================================================
 * A SEPARATE channel from the global snapshot in `importExport.ts`.
 *
 *   Global  (utils/importExport.ts + database.ts:importData)
 *     → destructive: wipes everything and reinserts. Used for backups.
 *
 *   Single deck  (this file)
 *     → additive: never deletes existing data. The deck enters as a NEW
 *       deck (fresh id, suffixed name if it would collide). Cards are
 *       added as NEW cards (no SR state, no logs).
 *
 * The two formats are intentionally NOT compatible. If a user feeds a
 * global backup into the single-deck importer or vice versa, we detect it
 * and refuse with a clear message pointing them at the right tool.
 *
 * Format versioning (single deck):
 *   v1 — initial. `attachments` field reserved but empty (ignored on import
 *        with a warning).
 *   v2 — `attachments` populated. Each attachment carries a base64 data URL
 *        in `data`. On import, both card and attachment ids are regenerated;
 *        `![[oldAttId]]` markers in `front`/`back` are remapped to the new
 *        ids. v1 files are still accepted.
 * ============================================================================
 */

import { db, uid, attUid } from '@/db/database';
import { newCardDefaults } from '@/scheduler/scheduler';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard, CardCategory } from '@/types/flashcard';
import { isPresetCategory, NO_CATEGORY } from '@/types/flashcard';
import type { Attachment, AttachmentKind } from '@/types/attachment';
import { dataUrlToBlob, remapAttachmentIds } from '@/utils/attachments';

// ── Format constants ─────────────────────────────────────────────────────────

export const DECK_EXPORT_FORMAT_VERSION = 2;
/** Versions this build can read. */
const SUPPORTED_FORMAT_VERSIONS = new Set<number>([1, 2]);
export const DECK_EXPORT_APP_NAME = 'Quanta';
export const DECK_EXPORT_TYPE = 'deck';

/**
 * Cards in the export DON'T carry SR state. Those fields are regenerated
 * with `newCardDefaults()` on import. The omitted fields are listed here
 * so the type system catches us if we ever change the SR set.
 */
export type ExportedCard = Omit<
  Flashcard,
  | 'state'
  | 'due'
  | 'stability'
  | 'difficulty'
  | 'elapsedDays'
  | 'scheduledDays'
  | 'reps'
  | 'lapses'
  | 'lastReview'
  | 'ease'
>;

/**
 * Attachment as serialized inside a deck export. Same shape as the global
 * AttachmentExport — kept here as a separate name to avoid coupling the
 * two formats at the type level (they could diverge later).
 *
 * `data` is a base64 data URL. `cardId` points at the EXPORTED card id;
 * the importer remaps both the card id and this attachment id at insert
 * time.
 */
export interface DeckAttachmentExport {
  id: string;
  cardId: string;
  type: AttachmentKind;
  mimeType: string;
  filename: string;
  size: number;
  /** Base64 data URL. */
  data: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeckExport {
  appName: typeof DECK_EXPORT_APP_NAME;
  exportType: typeof DECK_EXPORT_TYPE;
  formatVersion: number;
  exportedAt: number;
  /** Cosmetic — recorded for diagnostics. Not used for validation. */
  appVersion: string;
  deck: Deck;
  /** Original folder, if any. On import we reuse a folder of the same name
   *  if it exists, or create one. `null` = the deck was loose. */
  folder: Folder | null;
  cards: ExportedCard[];
  /** All category keys actually USED by the exported cards. */
  categories: string[];
  /** v2: attachments referenced by the exported cards. */
  attachments: DeckAttachmentExport[];
}

// ── Build (export) ───────────────────────────────────────────────────────────

/**
 * Pure builder — no DB access, no Blob conversion. The caller fetches:
 *   - the deck
 *   - the cards
 *   - the parent folder (or null)
 *   - the attachments of those cards, already serialized to base64
 *
 * Cards are stripped of SR fields here.
 *
 * Why the caller does the base64 conversion: this keeps the builder
 * synchronous and pure, easier to test, and lets the caller decide whether
 * to parallelize the (potentially slow) Blob reads.
 */
export function buildDeckExport(
  deck: Deck,
  cards: Flashcard[],
  folder: Folder | null,
  attachments: DeckAttachmentExport[] = [],
  appVersion = '0.2',
): DeckExport {
  // Strip SR fields. Listing the kept ones explicitly is safer than
  // delete-from-spread (catches type changes).
  //
  // Campos INTENCIONALMENTE OMITIDOS:
  //   - `state`, `due`, `stability`, `difficulty`, `elapsedDays`,
  //     `scheduledDays`, `reps`, `lapses`, `lastReview`, `ease`:
  //     estado de SR raiz. Cards importados começam novos.
  //   - `clozeStates`: estado de SR POR CHAVE (multi-cloze). Mesma
  //     lógica — cards importados começam sem clozeStates; o populate
  //     defensivo acontece na primeira avaliação.
  //
  // Quando o usuário compartilha um deck, está compartilhando o
  // CONTEÚDO (frente/verso/tipo/interação/áudio/imagens), não a
  // memória que ele próprio construiu revisando.
  const exportedCards: ExportedCard[] = cards.map(c => ({
    id: c.id,
    deckId: c.deckId,
    front: c.front,
    back: c.back,
    type: c.type,
    interaction: c.interaction,
    // Per-card narration record. Optional: cards without configured
    // narration carry undefined here, which serializes out of the JSON
    // entirely (cleaner backups).
    speech: c.speech,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  // Distinct categories actually used. Filter out '' (NO_CATEGORY) — that's
  // the sentinel, not a real category.
  const categorySet = new Set<string>();
  for (const c of cards) {
    if (c.type && c.type !== NO_CATEGORY) categorySet.add(c.type);
  }

  return {
    appName: DECK_EXPORT_APP_NAME,
    exportType: DECK_EXPORT_TYPE,
    formatVersion: DECK_EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    appVersion,
    deck,
    folder,
    cards: exportedCards,
    categories: Array.from(categorySet),
    attachments,
  };
}

/**
 * Trigger a JSON download. Filename is sanitized so Windows accepts it.
 */
export function downloadDeckJson(data: DeckExport, deckName: string) {
  // Windows-safe filename: replace anything that NTFS rejects with -.
  const safe = deckName
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const date = new Date(data.exportedAt).toISOString().slice(0, 10);
  const filename = `quanta-deck-${safe || 'sem-nome'}-${date}.json`;

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

// ── Validation / read ────────────────────────────────────────────────────────

export class DeckImportError extends Error {
  constructor(
    public kind:
      | 'invalid_json'
      | 'wrong_app'
      | 'wrong_export_type'
      | 'wrong_global_format'
      | 'unsupported_version'
      | 'missing_fields'
      | 'invalid_structure'
      | 'db_error',
    message: string,
  ) {
    super(message);
    this.name = 'DeckImportError';
  }
}

/**
 * Read a deck export file and validate its shape. Throws DeckImportError
 * with a kind-tagged code that the modal turns into a human message.
 *
 * Tolerance:
 *   - Missing `attachments` is treated as `[]` (v1 files).
 *   - Missing `folder` is treated as `null`.
 *   - Extra unknown top-level fields are ignored.
 *
 * Hard requirements:
 *   - appName === 'Quanta'
 *   - exportType === 'deck'  (this is the SINGLE-DECK importer)
 *   - formatVersion ∈ SUPPORTED_FORMAT_VERSIONS
 *   - deck is an object, cards is an array
 */
export function readDeckExportFile(file: File): Promise<DeckExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        new DeckImportError(
          'invalid_json',
          'Não foi possível ler o arquivo.',
        ),
      );
    reader.onload = () => {
      let parsed: any;
      try {
        parsed = JSON.parse(reader.result as string);
      } catch {
        return reject(
          new DeckImportError(
            'invalid_json',
            'Arquivo não é um JSON válido.',
          ),
        );
      }
      if (typeof parsed !== 'object' || parsed === null) {
        return reject(
          new DeckImportError(
            'invalid_structure',
            'Conteúdo do arquivo não é um objeto JSON.',
          ),
        );
      }
      if (
        Array.isArray(parsed.decks) &&
        !parsed.exportType &&
        parsed.appName !== DECK_EXPORT_APP_NAME
      ) {
        return reject(
          new DeckImportError(
            'wrong_global_format',
            'Este arquivo parece ser um backup completo. ' +
              'Use Configurações → Dados e backup → Importar tudo.',
          ),
        );
      }
      if (parsed.appName !== DECK_EXPORT_APP_NAME) {
        return reject(
          new DeckImportError(
            'wrong_app',
            'Arquivo não parece ser do Quanta.',
          ),
        );
      }
      if (parsed.exportType !== DECK_EXPORT_TYPE) {
        return reject(
          new DeckImportError(
            'wrong_export_type',
            'Este arquivo não é um baralho individual.',
          ),
        );
      }
      if (!SUPPORTED_FORMAT_VERSIONS.has(parsed.formatVersion)) {
        return reject(
          new DeckImportError(
            'unsupported_version',
            `Versão de formato ${parsed.formatVersion} não é suportada ` +
              `nesta versão do Quanta.`,
          ),
        );
      }
      if (
        typeof parsed.deck !== 'object' ||
        parsed.deck === null ||
        typeof parsed.deck.name !== 'string'
      ) {
        return reject(
          new DeckImportError(
            'missing_fields',
            'Estrutura do baralho está incompleta.',
          ),
        );
      }
      if (!Array.isArray(parsed.cards)) {
        return reject(
          new DeckImportError(
            'missing_fields',
            'Lista de cartões ausente ou inválida.',
          ),
        );
      }
      if (
        parsed.attachments !== undefined &&
        !Array.isArray(parsed.attachments)
      ) {
        return reject(
          new DeckImportError(
            'invalid_structure',
            'Campo de anexos com formato inválido.',
          ),
        );
      }

      const normalized: DeckExport = {
        appName: parsed.appName,
        exportType: parsed.exportType,
        formatVersion: parsed.formatVersion,
        exportedAt: parsed.exportedAt ?? Date.now(),
        appVersion: parsed.appVersion ?? 'unknown',
        deck: parsed.deck,
        folder: parsed.folder ?? null,
        cards: parsed.cards,
        categories: Array.isArray(parsed.categories)
          ? parsed.categories.filter((c: unknown) => typeof c === 'string')
          : [],
        attachments: Array.isArray(parsed.attachments)
          ? parsed.attachments
          : [],
      };

      resolve(normalized);
    };
    reader.readAsText(file);
  });
}

// ── Import (additive) ────────────────────────────────────────────────────────

export interface DeckImportResult {
  insertedDeckName: string;
  insertedDeckId: string;
  cardCount: number;
  /** Number of attachments that were actually imported (v2 path). */
  attachmentCount: number;
  warnings: string[];
}

/**
 * Apply a parsed DeckExport to the live DB. Strictly additive.
 *
 * Two passes when attachments exist:
 *
 *   1. Build id maps:
 *        - cardIdMap:  oldCardId  → newCardId (uid())
 *        - attIdMap:   oldAttId   → newAttId   (attUid())
 *      Maps are computed BEFORE any DB write, so all rewrites use the
 *      final ids.
 *
 *   2. Insert in this order, inside one transaction:
 *        a) folder (reuse-by-name or create)
 *        b) deck (with unique name suffix if needed)
 *        c) cards (front/back have markers remapped via attIdMap)
 *        d) attachments (data: base64 → Blob, cardId remapped via
 *           cardIdMap, id replaced via attIdMap)
 *
 * Attachments whose `cardId` doesn't match any exported card are dropped
 * with a warning (defensive — should never happen with files we produce).
 */
export async function importDeckExport(
  payload: DeckExport,
): Promise<DeckImportResult> {
  const warnings: string[] = [];

  // v1 carried an empty `attachments` placeholder; v2 may carry real
  // attachments. Either way, we only do real work if there are entries.
  const hasAttachments =
    Array.isArray(payload.attachments) && payload.attachments.length > 0;

  // ── Pass 1: id maps ───────────────────────────────────────────────────────
  // Build them outside the transaction since they're pure computation.
  const cardIdMap = new Map<string, string>();
  for (const c of payload.cards) {
    cardIdMap.set(c.id, uid());
  }
  const attIdMap = new Map<string, string>();
  if (hasAttachments) {
    for (const a of payload.attachments) {
      attIdMap.set(a.id, attUid());
    }
  }

  // Pre-convert attachment payloads to Blobs (async). Anything that fails
  // to decode here is dropped with a warning rather than aborting the
  // whole import — partial recovery is friendlier for a user with one bad
  // image in a 50-card deck.
  type PreparedAttachment = {
    id: string;
    cardId: string;
    type: AttachmentKind;
    mimeType: string;
    filename: string;
    size: number;
    data: Blob;
    createdAt: number;
    updatedAt: number;
  };
  let preparedAttachments: PreparedAttachment[] = [];
  if (hasAttachments) {
    const ts = Date.now();
    const results = await Promise.allSettled(
      payload.attachments.map(async a => {
        const newId = attIdMap.get(a.id);
        const newCardId = cardIdMap.get(a.cardId);
        if (!newId || !newCardId) {
          throw new Error(`Anexo "${a.filename}" referencia cartão inexistente.`);
        }
        const blob = await dataUrlToBlob(a.data);
        return {
          id: newId,
          cardId: newCardId,
          type: a.type,
          mimeType: a.mimeType,
          filename: a.filename,
          size: a.size,
          data: blob,
          createdAt: a.createdAt ?? ts,
          updatedAt: ts,
        };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        preparedAttachments.push(r.value);
      } else {
        warnings.push(
          `Um anexo foi descartado durante a importação: ${
            r.reason?.message ?? r.reason
          }`,
        );
      }
    }
  }

  // ── Pass 2: DB writes ─────────────────────────────────────────────────────
  return await db.transaction(
    'rw',
    [db.decks, db.folders, db.cards, db.settings, db.attachments],
    async () => {
      // ── Folder: reuse-by-name or create ────────────────────────────────
      let folderId: string | null = null;
      if (payload.folder) {
        const existingFolder = await db.folders
          .where('name')
          .equals(payload.folder.name)
          .first();
        if (existingFolder) {
          folderId = existingFolder.id;
        } else {
          const newFolder: Folder = {
            ...payload.folder,
            id: uid(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await db.folders.add(newFolder);
          folderId = newFolder.id;
        }
      }

      // ── Deck name: collide → suffix "(importado)" / "(importado 2)" ───
      const baseName = payload.deck.name;
      const insertedDeckName = await uniqueDeckName(baseName);
      const newDeckId = uid();
      const newDeck: Deck = {
        ...payload.deck,
        id: newDeckId,
        name: insertedDeckName,
        folderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.decks.add(newDeck);

      // ── Categories: reuse / unhide / add ──────────────────────────────
      const settings = await db.settings.get('singleton');
      if (settings) {
        let nextCustom = settings.customCategories
          ? [...settings.customCategories]
          : [];
        let nextHidden = settings.hiddenPresetCategories
          ? [...settings.hiddenPresetCategories]
          : [];
        let settingsChanged = false;

        for (const cat of payload.categories) {
          if (isPresetCategory(cat)) {
            if (nextHidden.includes(cat)) {
              nextHidden = nextHidden.filter(h => h !== cat);
              settingsChanged = true;
              warnings.push(
                `Categoria predefinida "${cat}" foi reativada porque ` +
                  `cartões importados a utilizam.`,
              );
            }
          } else {
            const existing = nextCustom.find(
              c => c.toLowerCase() === cat.toLowerCase(),
            );
            if (!existing) {
              nextCustom.push(cat);
              settingsChanged = true;
            }
          }
        }

        if (settingsChanged) {
          await db.settings.put({
            ...settings,
            customCategories: nextCustom,
            hiddenPresetCategories: nextHidden,
            updatedAt: Date.now(),
          });
        }
      }

      // ── Cards: fresh ids, fresh SR state, remapped markers ────────────
      const ts = Date.now();
      const newCards: Flashcard[] = payload.cards.map(c => {
        const safeType: CardCategory = sanitizeCategory(c.type);
        const newId = cardIdMap.get(c.id)!;
        const front = remapAttachmentIds(c.front ?? '', attIdMap);
        const back = remapAttachmentIds(c.back ?? '', attIdMap);
        return {
          id: newId,
          deckId: newDeckId,
          front,
          back,
          type: safeType,
          interaction: c.interaction,
          // Preserve per-card narration verbatim. The text doesn't reference
          // attachments, so no remapping is necessary — it's the spoken
          // version of the front/back, not the markdown.
          ...(c.speech ? { speech: c.speech } : {}),
          createdAt: ts,
          updatedAt: ts,
          // newCardDefaults() zera os 10 campos de SR raiz. Cartões
          // multi-cloze entram SEM `clozeStates` (omissão silenciosa) —
          // a primeira revisão dispara o populate defensivo em
          // `applyRatingResult`. Coerente com a omissão lá em
          // `buildDeckExport`.
          ...newCardDefaults(),
        };
      });
      if (newCards.length > 0) {
        await db.cards.bulkAdd(newCards);
      }

      // ── Attachments: Blob already prepared, ids already mapped ────────
      let attachmentCount = 0;
      if (preparedAttachments.length > 0) {
        // Convert to the runtime Attachment shape. TypeScript-wise this is
        // a no-op (PreparedAttachment is structurally identical to
        // Attachment), but the explicit cast documents the boundary.
        const rows: Attachment[] = preparedAttachments.map(p => ({ ...p }));
        await db.attachments.bulkAdd(rows);
        attachmentCount = rows.length;
      }

      return {
        insertedDeckName,
        insertedDeckId: newDeckId,
        cardCount: newCards.length,
        attachmentCount,
        warnings,
      };
    },
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uniqueDeckName(baseName: string): Promise<string> {
  const exists = async (n: string) =>
    !!(await db.decks.where('name').equalsIgnoreCase(n).first());

  if (!(await exists(baseName))) return baseName;
  let n = 1;
  while (true) {
    const suffix = n === 1 ? '(importado)' : `(importado ${n})`;
    const candidate = `${baseName} ${suffix}`;
    if (!(await exists(candidate))) return candidate;
    n += 1;
    if (n > 999) return `${baseName} (importado ${Date.now()})`;
  }
}

function sanitizeCategory(t: unknown): CardCategory {
  if (typeof t !== 'string') return NO_CATEGORY;
  return t as CardCategory;
}
