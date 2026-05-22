import type { CardSpeech } from './speech';

export type CardType =
  | 'conceito'
  | 'formula'
  | 'derivacao'
  | 'definicao'
  | 'erro_comum'
  | 'exemplo';

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  conceito: 'Conceito',
  formula: 'Fórmula',
  derivacao: 'Derivação',
  definicao: 'Definição',
  erro_comum: 'Erro comum',
  exemplo: 'Exemplo resolvido',
};

/**
 * Sentinel value for "no category". An empty string (rather than a real
 * key) keeps it falsy and trivially serializable, and a card whose
 * category was deleted is migrated to this value — never left dangling.
 */
export const NO_CATEGORY = '';
export const NO_CATEGORY_LABEL = 'Sem categoria';

/**
 * Effective card category. Includes the preset `CardType` union AND any
 * user-defined name from `Settings.customCategories`, plus the empty-string
 * `NO_CATEGORY` sentinel.
 *
 * The `(string & {})` trick keeps autocomplete for the preset keys while
 * still accepting any string at the type level — no migration needed:
 * existing cards have always been stored as strings at the IndexedDB
 * layer, so a custom name fits without changing the storage format.
 *
 * Anywhere a card's category needs to be rendered, use `getCategoryLabel`
 * (below) — it resolves preset, custom, and "no category" uniformly.
 */
export type CardCategory = CardType | (string & {});

const PRESET_CATEGORY_KEYS = Object.keys(CARD_TYPE_LABELS) as CardType[];

export function isPresetCategory(value: string): value is CardType {
  return (PRESET_CATEGORY_KEYS as string[]).includes(value);
}

/**
 * Returns the user-facing label for a category — preset, custom, or none.
 * Presets look up `CARD_TYPE_LABELS`; customs use the stored name as-is;
 * the empty sentinel renders as "Sem categoria".
 */
export function getCategoryLabel(value: string): string {
  if (value === NO_CATEGORY) return NO_CATEGORY_LABEL;
  if (isPresetCategory(value)) return CARD_TYPE_LABELS[value];
  return value;
}

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * How the card is presented and graded.
 *
 * `classic` is the original behavior: user reveals back, self-rates.
 * The other three variants are auto-graded against the user's input,
 * which makes them eligible for Rush mode.
 *
 * Stored as a tagged union on the card so each variant carries only the
 * data it needs. Cards without an `interaction` field default to classic
 * (zero migration cost).
 */
export type CardInteraction =
  | { kind: 'classic' }
  | {
      kind: 'multiple_choice';
      /** 2 to 6 options. Markdown + LaTeX are supported in each option. */
      options: string[];
      /** Index into `options` of the correct answer. */
      correctIndex: number;
    }
  | {
      kind: 'cloze';
      // The `front` field carries the cloze text with `{{c1::answer}}` or
      // `{{c1::answer::hint}}` markers. The user fills in the blank; we
      // compare normalized strings (case/whitespace insensitive). The
      // `back` may contain notes / explanation shown after grading.
    }
  | {
      kind: 'true_false';
      /** Whether the statement in `front` is true. */
      correct: boolean;
    };

export const RUSH_COMPATIBLE_KINDS = [
  'multiple_choice',
  'cloze',
  'true_false',
] as const;

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /**
   * Didactic classification. May be a preset key (`'conceito'`, `'formula'`,
   * …) or a free-form name created by the user (see Settings.customCategories
   * and `CardCategory`). Use `getCategoryLabel(type)` to render.
   */
  type: CardCategory;
  /**
   * Optional. When omitted, the card behaves as `{ kind: 'classic' }`.
   * Lets old data load without a schema migration.
   */
  interaction?: CardInteraction;

  /**
   * Optional narration text + per-side toggles. Undefined for cards that
   * have never had narration configured; partial states (toggle on, text
   * pending) are valid too. The review UI only shows a button when the
   * relevant side has BOTH `enabled === true` AND a non-empty `text`.
   * See `src/types/speech.ts` for the full type and the rationale.
   */
  speech?: CardSpeech;

  // Estado da repetição espaçada (variante SM-2 com nomes inspirados em FSRS)
  state: CardState;
  due: number; // timestamp da próxima revisão
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  ease: number;

  /**
   * Estados de revisão independentes por chave de cloze (`c1`, `c2`, ...).
   *
   * Existe somente em cartões `interaction.kind === 'cloze'` com múltiplas
   * chaves OU em cartões cloze com 1 só chave que JÁ FORAM MIGRADOS de
   * forma lazy (ver `utils/reviewItems.ts`). Quando ausente, a revisão
   * usa o state raiz do cartão (campos `state`, `due`, `stability`, etc.)
   * como fallback — é o que mantém cartões cloze antigos funcionando
   * exatamente como antes.
   *
   * INVARIANTE importante: quando `clozeStates` está populado e o cartão
   * é multi-cloze, o `due` raiz acima passa a refletir o MENOR `due`
   * entre todas as chaves. Isso preserva queries como `where('due').belowOrEqual`
   * (HomePage / Stats) funcionando: um cartão multi-cloze com qualquer
   * chave vencida aparece como "vencido". A revisão é que enumera as
   * chaves individualmente.
   */
  clozeStates?: Record<string, SchedulingState>;

  createdAt: number;
  updatedAt: number;
}

/**
 * Subconjunto do Flashcard que descreve o estado de repetição espaçada
 * de UMA unidade de revisão. Para cartões clássicos / não-cloze, é o
 * estado do próprio cartão. Para cartões multi-cloze, cada chave (`c1`,
 * `c2`, …) tem seu próprio `SchedulingState` em `Flashcard.clozeStates`.
 *
 * O scheduler opera sobre `SchedulingState` (via `scheduleState`) e
 * devolve um novo `SchedulingState`. Quem chama é que decide se aplica
 * no estado raiz do cartão ou numa chave de `clozeStates`.
 */
export type SchedulingState = Pick<
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
 * Returns the card's effective interaction, treating undefined as classic.
 * Use this anywhere downstream code reads the kind.
 */
export function getInteraction(card: Flashcard): CardInteraction {
  return card.interaction ?? { kind: 'classic' };
}

export function isRushCompatible(card: Flashcard): boolean {
  const ix = getInteraction(card);
  return (RUSH_COMPATIBLE_KINDS as readonly string[]).includes(ix.kind);
}
