import Dexie, { type Table } from 'dexie';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Settings, UserStats } from '@/types/stats';
import type { Attachment } from '@/types/attachment';
import type { StudySessionLog } from '@/types/focus';
import { newCardDefaults, DEFAULT_SCHEDULER_CONFIG } from '@/scheduler/scheduler';
import { DEFAULT_COLOR_KEY } from '@/utils/folderColors';
import { DEFAULT_SHORTCUTS } from '@/utils/shortcuts';
import {
  DEFAULT_BREAK_SECONDS,
  DEFAULT_FOCUS_REWARDS,
  DEFAULT_FOCUS_SECONDS,
} from '@/utils/focus';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/utils/notifications';

class QuantaDB extends Dexie {
  decks!: Table<Deck, string>;
  folders!: Table<Folder, string>;
  cards!: Table<Flashcard, string>;
  reviewLogs!: Table<ReviewLog, string>;
  userStats!: Table<UserStats, string>;
  settings!: Table<Settings, string>;
  attachments!: Table<Attachment, string>;
  studySessionLogs!: Table<StudySessionLog, string>;

  constructor() {
    super('quanta');

    // ── v1: original schema, no folders ────────────────────────────────────
    this.version(1).stores({
      decks: 'id, name, createdAt',
      cards: 'id, deckId, due, state, type, createdAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      userStats: 'id',
      settings: 'id',
    });

    // ── v2: adds folders table, indexes folderId on decks ──────────────────
    // Existing decks have no folderId; the upgrade callback sets it to null
    // and gives them a default colorKey so the new UI has something to show.
    this.version(2)
      .stores({
        decks: 'id, folderId, name, createdAt',
        folders: 'id, name, createdAt',
        cards: 'id, deckId, due, state, type, createdAt',
        reviewLogs: 'id, cardId, deckId, reviewedAt',
        userStats: 'id',
        settings: 'id',
      })
      .upgrade(async tx => {
        await tx
          .table('decks')
          .toCollection()
          .modify((deck: Partial<Deck>) => {
            if (deck.folderId === undefined) deck.folderId = null;
            if (deck.colorKey === undefined) deck.colorKey = DEFAULT_COLOR_KEY;
          });
      });

    // ── v3: adds the `attachments` table for image (and future audio) media.
    // Pure additive migration — no existing data needs to be touched. The
    // table is empty on first open after the upgrade; cards continue to
    // render exactly as before because their content has no markers yet.
    this.version(3).stores({
      decks: 'id, folderId, name, createdAt',
      folders: 'id, name, createdAt',
      cards: 'id, deckId, due, state, type, createdAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      userStats: 'id',
      settings: 'id',
      attachments: 'id, cardId, type, createdAt',
    });

    // ── v4: nova tabela studySessionLogs (Sessão de foco) ─────────────────
    // Aditivo. Repete as 7 tabelas anteriores intactas e ADICIONA a oitava.
    // Dexie infere o upgrade automaticamente — não precisa de migration
    // callback porque não estamos transformando dados existentes.
    this.version(4).stores({
      decks: 'id, folderId, name, createdAt',
      folders: 'id, name, createdAt',
      cards: 'id, deckId, due, state, type, createdAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      userStats: 'id',
      settings: 'id',
      attachments: 'id, cardId, type, createdAt',
      studySessionLogs: 'id, startedAt, createdAt',
    });
  }
}

export const db = new QuantaDB();

// ─────────────────────────────────────────────────────────────────────────────
// IDs
// ─────────────────────────────────────────────────────────────────────────────
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Attachment-specific id with the `att_` prefix. Embedded in card content as
 * `![[att_xxx]]`, so the prefix is what lets the marker regex disambiguate.
 * Keep the prefix; the random tail is the same shape as `uid()`.
 */
export function attUid(): string {
  return `att_${uid()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_USER_STATS: UserStats = {
  id: 'singleton',
  xp: 0,
  totalReviews: 0,
  streakDays: 0,
  longestStreak: 0,
  lastStudyDate: null,
  bonusFlags: { completedToday: null, streakWeeklyAt: 0 },
  updatedAt: Date.now(),
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  userName: 'Estudante',
  theme: 'dark',
  motivationalEnabled: true,
  dailyGoal: 20,
  scheduler: { ...DEFAULT_SCHEDULER_CONFIG },
  reviewFontScale: 'lg',
  customCategories: [],
  hiddenPresetCategories: [],
  speech: {
    enabled: true,
    rate: 1.0,
    volume: 1.0,
    pitch: 1.0,
  },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  focus: {
    lastFocusSeconds: DEFAULT_FOCUS_SECONDS,
    lastBreakSeconds: DEFAULT_BREAK_SECONDS,
    rewards: [...DEFAULT_FOCUS_REWARDS],
    showRewards: true,
  },
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  updatedAt: Date.now(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Demo seed (NOT invoked automatically — kept for a potential future
// "Load demo deck" button in Settings). Calling this when the database
// has any deck is a no-op.
//
// Why not auto-seed? The previous version re-seeded every time the deck
// table happened to be empty, which meant: delete all decks → reopen app →
// the demo deck comes back. That's confusing and overwrites the user's
// intent. New behavior: the app starts empty for new users; a demo deck is
// only created if explicitly requested.
// ─────────────────────────────────────────────────────────────────────────────
export async function seedDemoDeck() {
  const deckCount = await db.decks.count();
  if (deckCount > 0) return;

  const now = Date.now();
  const deckId = uid();

  const deck: Deck = {
    id: deckId,
    folderId: null,
    name: 'Mecânica Estatística',
    description:
      'Ensembles, função de partição, potencial grande canônico, flutuações e gases ideais.',
    colorKey: 'cyan',
    createdAt: now,
    updatedAt: now,
  };

  const cards: Flashcard[] = [
    {
      id: uid(),
      deckId,
      front: 'O que é a função de partição grande canônica?',
      back: '$$\\mathcal{Z}(T,V,\\mu)=\\sum_{N=0}^{\\infty} z^N\\, Z_N(T,V)$$\n\ncom fugacidade $z = e^{\\beta \\mu}$ e $Z_N$ a função de partição canônica de $N$ partículas.',
      type: 'definicao',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      deckId,
      front: 'Como se escreve a fugacidade em função de $\\mu$ e $T$?',
      back: '$$z = e^{\\beta \\mu}, \\quad \\beta = \\frac{1}{k_B T}$$',
      type: 'formula',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      deckId,
      front:
        'Qual é a relação entre o grande potencial $\\Omega$ e a função de partição grande canônica?',
      back: '$$\\Omega(T,V,\\mu) = -k_B T \\ln \\mathcal{Z}(T,V,\\mu)$$',
      type: 'formula',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      deckId,
      front: 'O que significa dizer que um cartão está **vencido**?',
      back: 'Um cartão está vencido quando sua data de próxima revisão \\(due\\) é **anterior ou igual** ao momento atual.',
      type: 'conceito',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      deckId,
      front:
        'Como obter o número médio de partículas $\\langle N \\rangle$ no ensemble grande canônico?',
      back: '$$\\langle N \\rangle = z\\, \\frac{\\partial \\ln \\mathcal{Z}}{\\partial z} = -\\frac{\\partial \\Omega}{\\partial \\mu}$$',
      type: 'derivacao',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      deckId,
      front:
        'Erro comum: confundir $Z$ canônica e $\\mathcal{Z}$ grande canônica.',
      back: '- $Z(T,V,N)$ é a soma sobre microestados com $N$ **fixo**.\n- $\\mathcal{Z}(T,V,\\mu)$ soma sobre todos os $N$, com peso $z^N$.\n\nVariável de controle: $N$ vs. $\\mu$.',
      type: 'erro_comum',
      ...newCardDefaults(),
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.userStats,
    db.settings,
    async () => {
      await db.decks.add(deck);
      await db.cards.bulkAdd(cards);

      const us = await db.userStats.get('singleton');
      if (!us) await db.userStats.put(DEFAULT_USER_STATS);

      const st = await db.settings.get('singleton');
      if (!st) await db.settings.put(DEFAULT_SETTINGS);
    },
  );
}

export async function ensureInitialized() {
  const us = await db.userStats.get('singleton');
  if (!us) await db.userStats.put(DEFAULT_USER_STATS);

  const st = await db.settings.get('singleton');
  if (!st) {
    await db.settings.put(DEFAULT_SETTINGS);
  } else {
    // Backfill fields added in later versions onto pre-existing settings,
    // so the new UI always has values to read. Each block is independent —
    // a setting created today shouldn't be re-written if nothing's missing.
    let needsPut = false;
    const patched: Settings = { ...st };
    if (!patched.scheduler) {
      patched.scheduler = { ...DEFAULT_SCHEDULER_CONFIG };
      needsPut = true;
    }
    if (!patched.reviewFontScale) {
      patched.reviewFontScale = 'lg';
      needsPut = true;
    }
    if (!patched.customCategories) {
      patched.customCategories = [];
      needsPut = true;
    }
    if (!patched.hiddenPresetCategories) {
      patched.hiddenPresetCategories = [];
      needsPut = true;
    }
    if (!patched.speech) {
      patched.speech = {
        enabled: true,
        rate: 1.0,
        volume: 1.0,
        pitch: 1.0,
      };
      needsPut = true;
    }
    if (!patched.shortcuts) {
      patched.shortcuts = { ...DEFAULT_SHORTCUTS };
      needsPut = true;
    }
    if (!patched.focus) {
      patched.focus = {
        lastFocusSeconds: DEFAULT_FOCUS_SECONDS,
        lastBreakSeconds: DEFAULT_BREAK_SECONDS,
        rewards: [...DEFAULT_FOCUS_REWARDS],
        showRewards: true,
      };
      needsPut = true;
    }
    if (!patched.notifications) {
      patched.notifications = { ...DEFAULT_NOTIFICATION_SETTINGS };
      needsPut = true;
    }
    if (needsPut) await db.settings.put(patched);
  }

  // No auto-seed. The app starts empty for new users; a demo deck is only
  // created if the user explicitly asks (future "Load demo" button calls
  // `seedDemoDeck()`).
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder operations
// ─────────────────────────────────────────────────────────────────────────────

export async function createFolder(input: {
  name: string;
  description?: string;
  colorKey?: string;
}): Promise<Folder> {
  const now = Date.now();
  const folder: Folder = {
    id: uid(),
    name: input.name,
    description: input.description,
    colorKey: input.colorKey ?? DEFAULT_COLOR_KEY,
    createdAt: now,
    updatedAt: now,
  };
  await db.folders.add(folder);
  return folder;
}

/**
 * Deletes a folder. Decks inside become "loose" (folderId = null) — we never
 * cascade-delete decks, since the user's data is precious. Cards & logs stay
 * with their decks.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  await db.transaction('rw', db.folders, db.decks, async () => {
    await db.decks.where('folderId').equals(folderId).modify({ folderId: null });
    await db.folders.delete(folderId);
  });
}

export async function moveDeckToFolder(
  deckId: string,
  folderId: string | null,
): Promise<void> {
  await db.decks.update(deckId, { folderId, updatedAt: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachment cascade
// ─────────────────────────────────────────────────────────────────────────────
//
// Attachments live in their own table and reference their owning card by
// `cardId`. Whenever a card or deck is deleted, the relevant rows MUST be
// removed in the same transaction — otherwise the table accumulates dead
// rows that nothing references and that the user can't even see.
//
// These helpers exist so call sites (DeckPage.deleteCard, DeckPage.deleteDeck,
// the global reset/import flows) don't have to know the where-clause shape.

/** Delete every attachment whose `cardId` matches. Idempotent. */
export async function deleteCardAttachments(cardId: string): Promise<void> {
  await db.attachments.where('cardId').equals(cardId).delete();
}

/**
 * Delete every attachment belonging to any card in the given deck. We can't
 * filter directly by deck on the attachments table (the FK is `cardId`, not
 * `deckId`), so we fetch the card ids first and then issue a single
 * `anyOf(...)` delete.
 */
export async function deleteDeckAttachments(deckId: string): Promise<void> {
  const cardIds = await db.cards.where('deckId').equals(deckId).primaryKeys();
  if (cardIds.length === 0) return;
  await db.attachments.where('cardId').anyOf(cardIds).delete();
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset / import / export
// ─────────────────────────────────────────────────────────────────────────────
export async function resetAll(): Promise<void> {
  await db.transaction(
    'rw',
    // Inclui TODAS as tabelas. `studySessionLogs` estava faltando antes
    // do bugfix; sem ele, logs de Sessão de Foco sobreviviam a um reset
    // global.
    [
      db.decks, db.folders, db.cards, db.reviewLogs,
      db.userStats, db.settings, db.attachments,
      db.studySessionLogs,
    ],
    async () => {
      await db.decks.clear();
      await db.folders.clear();
      await db.cards.clear();
      await db.reviewLogs.clear();
      await db.userStats.clear();
      await db.settings.clear();
      await db.attachments.clear();
      await db.studySessionLogs.clear();
    },
  );
  await ensureInitialized();
}

export async function importData(data: {
  decks: Deck[];
  folders?: Folder[];
  cards: Flashcard[];
  reviewLogs: ReviewLog[];
  userStats: UserStats;
  settings: Settings;
  /**
   * Optional — exports from v1/v2 won't include this. The attachments have
   * already been deserialized from base64 into Blob by the caller (see
   * SettingsPage.handleImport).
   */
  attachments?: Attachment[];
}) {
  await db.transaction(
    'rw',
    [
      db.decks, db.folders, db.cards, db.reviewLogs,
      db.userStats, db.settings, db.attachments,
      db.studySessionLogs,
    ],
    async () => {
      await db.decks.clear();
      await db.folders.clear();
      await db.cards.clear();
      await db.reviewLogs.clear();
      await db.userStats.clear();
      await db.settings.clear();
      await db.attachments.clear();
      await db.studySessionLogs.clear();

      // Backwards compat: a v1 export won't have folders or folderId on decks.
      const normalizedDecks: Deck[] = data.decks.map(d => ({
        ...d,
        folderId: d.folderId ?? null,
        colorKey: d.colorKey ?? DEFAULT_COLOR_KEY,
      }));

      await db.decks.bulkAdd(normalizedDecks);
      if (data.folders?.length) await db.folders.bulkAdd(data.folders);
      await db.cards.bulkAdd(data.cards);
      await db.reviewLogs.bulkAdd(data.reviewLogs);
      await db.userStats.put(data.userStats);
      if (data.attachments?.length) {
        await db.attachments.bulkAdd(data.attachments);
      }
      // Backwards compat: pre-v0.3 exports have no `scheduler` block;
      // pre-Phase-1 exports have no `reviewFontScale`; pre-Phase-1.5
      // exports have no `customCategories`. Backfill all of them.
      const normalizedSettings: Settings = {
        ...data.settings,
        scheduler: data.settings.scheduler ?? { ...DEFAULT_SCHEDULER_CONFIG },
        reviewFontScale: data.settings.reviewFontScale ?? 'lg',
        customCategories: data.settings.customCategories ?? [],
        hiddenPresetCategories: data.settings.hiddenPresetCategories ?? [],
      };
      await db.settings.put(normalizedSettings);
    },
  );
}
