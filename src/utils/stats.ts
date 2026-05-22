import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import { now, lastNDays, toDayKey } from './dates';

export type CardCategory =
  | 'novo'
  | 'jovem'
  | 'maduro'
  | 'problematico'
  | 'atrasado';

export interface DeckProgress {
  total: number;
  novos: number;
  jovens: number;
  maduros: number;
  problematicos: number;
  atrasados: number;
  vencidos: number;
  taxaAcerto: number;
}

/**
 * Categoriza um cartão para fins de estatística.
 * - novo: nunca foi revisado
 * - problematico: muitos lapses (>= 3)
 * - maduro: intervalo agendado >= 21 dias
 * - jovem: caso contrário, mas já revisado
 * - atrasado: due passou (calculado à parte; um cartão atrasado pode também ser maduro/jovem)
 */
export function categorize(card: Flashcard): CardCategory {
  if (card.lapses >= 3) return 'problematico';
  if (card.reps === 0) return 'novo';
  if (card.scheduledDays >= 21) return 'maduro';
  return 'jovem';
}

export function isOverdue(card: Flashcard): boolean {
  return card.due <= now() && card.reps > 0;
}

export function isDue(card: Flashcard): boolean {
  return card.due <= now();
}

export function deckProgress(
  cards: Flashcard[],
  logs: ReviewLog[],
): DeckProgress {
  const total = cards.length;
  let novos = 0,
    jovens = 0,
    maduros = 0,
    problematicos = 0,
    atrasados = 0,
    vencidos = 0;

  for (const c of cards) {
    const cat = categorize(c);
    if (cat === 'novo') novos++;
    else if (cat === 'jovem') jovens++;
    else if (cat === 'maduro') maduros++;
    else if (cat === 'problematico') problematicos++;
    if (isOverdue(c)) atrasados++;
    if (isDue(c)) vencidos++;
  }

  const correct = logs.filter((l) => l.rating > 1).length;
  const taxaAcerto = logs.length === 0 ? 0 : correct / logs.length;

  return {
    total,
    novos,
    jovens,
    maduros,
    problematicos,
    atrasados,
    vencidos,
    taxaAcerto,
  };
}

export interface DailyReviewBucket {
  date: string;
  total: number;
  correct: number;
  wrong: number;
}

export function reviewsByDay(
  logs: ReviewLog[],
  days: number = 7,
): DailyReviewBucket[] {
  const keys = lastNDays(days);
  const map = new Map<string, DailyReviewBucket>();
  for (const k of keys) {
    map.set(k, { date: k, total: 0, correct: 0, wrong: 0 });
  }
  for (const log of logs) {
    const k = toDayKey(log.reviewedAt);
    const bucket = map.get(k);
    if (!bucket) continue;
    bucket.total++;
    if (log.rating > 1) bucket.correct++;
    else bucket.wrong++;
  }
  return keys.map((k) => map.get(k)!);
}

export function reviewsTodayCount(logs: ReviewLog[]): number {
  const today = toDayKey(now());
  return logs.filter((l) => toDayKey(l.reviewedAt) === today).length;
}
