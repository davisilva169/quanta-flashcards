export type Rating = 1 | 2 | 3 | 4; // Errei, Difícil, Bom, Fácil

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Errei',
  2: 'Difícil',
  3: 'Bom',
  4: 'Fácil',
};

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: Rating;
  reviewedAt: number;
  intervalDays: number;
  prevState: string;
  newState: string;
  /**
   * How long the user spent on this card, in milliseconds.
   * Optional for backward compatibility with logs from earlier versions.
   * Capped at 2 minutes to avoid AFK pollution of the daily total.
   */
  durationMs?: number;
  /**
   * Identificador da chave de cloze revisada (`c1`, `c2`, …) quando o
   * cartão é multi-cloze. `undefined` para cartões não-cloze e para
   * cartões cloze antigos cuja revisão ainda usa o state raiz. Permite
   * análises futuras "qual chave do meu cartão estou errando mais?".
   */
  clozeKey?: string;
}
