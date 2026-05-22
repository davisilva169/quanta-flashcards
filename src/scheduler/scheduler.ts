/**
 * Spaced repetition scheduler — SM-2 backbone with Anki-style day boundary.
 *
 * Why "day boundary" matters
 * --------------------------
 * Plain SM-2 schedules N days in the future as `now + N * 24h`. So if you
 * review "Bom" with interval 1 day at 21h, the card becomes due tomorrow at
 * 21h — *not* tomorrow morning. That feels broken: people expect "if I
 * studied yesterday, my cards are ready when I sit down today".
 *
 * Anki solves this by snapping day-scale intervals to a configurable
 * rollover hour (default 4 AM). A "1-day" interval becomes "the next 4 AM
 * boundary"; a "7-day" interval becomes "7 boundaries from now". Reviewing
 * before the rollover hour still counts as the previous study day, so a
 * pre-dawn session doesn't confuse the schedule.
 *
 * Sub-day intervals (relearning after a lapse) keep wall-clock semantics —
 * 10 minutes means 10 minutes — because that's what's actually useful for
 * within-session re-tries.
 *
 * Mapping of ratings
 * ------------------
 *   1 = Errei   (Again)   — lapse: ease drops, card goes to relearning
 *   2 = Difícil (Hard)    — interval *= hardFactor, ease drops slightly
 *   3 = Bom     (Good)    — interval *= ease (the SM-2 default)
 *   4 = Fácil   (Easy)    — interval *= ease * easyBonus, ease rises
 *
 * Anki parity & deviations
 * ------------------------
 * This is not a 1:1 port. We use SM-2 with day-boundary snapping and
 * configurable parameters; we skip Anki's full learning-step list (we have
 * a single relearning step, a single graduating interval, and a single
 * easy interval). For most users this captures the practically-relevant
 * behavior. A future round can add multi-step learning if needed.
 */

import type { Flashcard, SchedulingState } from '@/types/flashcard';
import type { Rating } from '@/types/review';
import type { SchedulerConfig } from '@/types/stats';

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  rolloverHour: 4,
  startingEase: 2.5,
  graduatingInterval: 1,
  easyInterval: 4,
  hardFactor: 1.2,
  easyBonus: 1.3,
  lapseMinutes: 10,
  maxInterval: 365,
};

const MIN_EASE = 1.3;
const MIN_INTERVAL_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScheduleResult {
  card: Flashcard;
  /** Effective interval in days (or 0 for sub-day relearning). */
  intervalDays: number;
}

/**
 * Resultado de agendamento puro: novo `SchedulingState` + intervalo.
 *
 * Diferente de `ScheduleResult`, este não devolve o Flashcard inteiro —
 * só os campos de SR. Útil para multi-cloze, onde o "estado" sendo
 * agendado pode ser uma chave dentro de `clozeStates`, não o estado
 * raiz do cartão.
 */
export interface ScheduleStateResult {
  state: SchedulingState;
  intervalDays: number;
}

/**
 * Most recent rollover boundary at or before `nowMs`.
 *
 * If we're past today's rolloverHour, that's today's rollover. Otherwise,
 * we're still in yesterday's study day, so the boundary is yesterday's
 * rolloverHour.
 */
function studyDayStart(nowMs: number, rolloverHour: number): number {
  const d = new Date(nowMs);
  d.setHours(rolloverHour, 0, 0, 0);
  if (d.getTime() > nowMs) {
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}

/**
 * Given an interval in days and the current time, return the timestamp of
 * the next "due" moment, snapped to the rollover boundary.
 *
 *   intervalDays = 1 → start of the next study day (next rolloverHour)
 *   intervalDays = N → N study-day boundaries after the current one
 */
function dueAtDayInterval(
  nowMs: number,
  intervalDays: number,
  rolloverHour: number,
): number {
  const dayStart = studyDayStart(nowMs, rolloverHour);
  return dayStart + intervalDays * MS_PER_DAY;
}

/**
 * Aplica `scheduleState` no estado raiz do cartão. Mantida como API
 * pública pra compatibilidade — todos os call sites antigos (`schedule(
 * card, ...)`) continuam funcionando. Equivalente a chamar `scheduleState`
 * passando os campos raiz do cartão e re-montar o Flashcard.
 *
 * Para multi-cloze: o caller (ReviewPage) chama `scheduleState` direto
 * passando o `clozeStates[key]` e monta o Flashcard atualizado por
 * conta própria — ver `utils/reviewItems.ts → applyRatingResult`.
 */
export function schedule(
  card: Flashcard,
  rating: Rating,
  nowMs: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): ScheduleResult {
  const { state, intervalDays } = scheduleState(
    extractStateFromCard(card),
    rating,
    nowMs,
    config,
  );
  const updated: Flashcard = {
    ...card,
    ...state,
    updatedAt: nowMs,
  };
  return { card: updated, intervalDays };
}

/**
 * Helper interno: extrai os 10 campos de SR do Flashcard. Sem alocação
 * extra a longo prazo (o spread cria um objeto novo, mas é descartado
 * pelo GC depois do scheduleState devolver o novo state).
 */
function extractStateFromCard(card: Flashcard): SchedulingState {
  return {
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.lastReview,
    ease: card.ease,
  };
}

/**
 * Agendamento puro: dado um SchedulingState, calcula o próximo.
 *
 * Esta é a versão genérica do algoritmo. NÃO conhece o conceito de
 * "cartão" — só opera sobre o sub-conjunto de campos de SR. Permite
 * que multi-cloze agende cada chave (`clozeStates[c1]`, `clozeStates[c2]`,
 * …) independentemente, reusando exatamente a mesma lógica que cards
 * clássicos usam.
 *
 * O código abaixo é uma cópia literal da função `schedule` anterior;
 * só trocamos `card.X` por `prev.X` e devolvemos um novo state em vez
 * de um novo Flashcard. Comportamento idêntico para os call sites
 * existentes (que vão pelo wrapper `schedule`).
 */
export function scheduleState(
  prev: SchedulingState,
  rating: Rating,
  nowMs: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): ScheduleStateResult {
  const isNew = prev.reps === 0 && prev.state === 'new';
  const elapsedDays = prev.lastReview
    ? Math.max(1, Math.round((nowMs - prev.lastReview) / MS_PER_DAY))
    : 0;

  let ease = prev.ease || config.startingEase;
  let intervalDays = prev.scheduledDays || 0;
  let lapses = prev.lapses;
  let reps = prev.reps;
  let state = prev.state;
  let difficulty = prev.difficulty;

  if (rating === 1) {
    // Errei → relearning
    ease = Math.max(MIN_EASE, ease - 0.2);
    lapses += 1;
    state = 'relearning';
    intervalDays = 0; // sub-day; due time computed below
    difficulty = Math.min(10, difficulty + 1);
  } else if (rating === 2) {
    // Difícil
    ease = Math.max(MIN_EASE, ease - 0.15);
    if (isNew) {
      intervalDays = config.graduatingInterval;
      state = 'learning';
    } else {
      intervalDays = Math.max(
        MIN_INTERVAL_DAYS,
        Math.round((prev.scheduledDays || 1) * config.hardFactor),
      );
      state = 'review';
    }
    reps += 1;
    difficulty = Math.min(10, difficulty + 0.5);
  } else if (rating === 3) {
    // Bom
    if (isNew) {
      intervalDays = config.graduatingInterval;
      state = 'learning';
    } else if (state === 'learning' || state === 'relearning') {
      // Pulled back from a lapse / first graduation: bump to 3 days as a
      // confidence-restoring step before the multiplicative growth resumes.
      intervalDays = Math.max(MIN_INTERVAL_DAYS, 3);
      state = 'review';
    } else {
      intervalDays = Math.max(
        MIN_INTERVAL_DAYS,
        Math.round((prev.scheduledDays || 1) * ease),
      );
      state = 'review';
    }
    reps += 1;
    difficulty = Math.max(1, difficulty - 0.1);
    if (lapses > 0) lapses = Math.max(0, lapses - 1);
  } else {
    // Fácil
    ease = ease + 0.15;
    if (isNew) {
      intervalDays = config.easyInterval;
    } else {
      intervalDays = Math.max(
        MIN_INTERVAL_DAYS,
        Math.round((prev.scheduledDays || 1) * ease * config.easyBonus),
      );
    }
    reps += 1;
    state = 'review';
    difficulty = Math.max(1, difficulty - 0.3);
    // "Fácil" recovers faster — clears two lapses at a time.
    if (lapses > 0) lapses = Math.max(0, lapses - 2);
  }

  intervalDays = Math.min(config.maxInterval, intervalDays);

  let due: number;
  if (rating === 1) {
    due = nowMs + config.lapseMinutes * 60 * 1000;
  } else {
    due = dueAtDayInterval(nowMs, intervalDays, config.rolloverHour);
  }

  const next: SchedulingState = {
    state,
    ease,
    difficulty,
    elapsedDays,
    scheduledDays: intervalDays,
    stability: Math.max(intervalDays, prev.stability),
    reps,
    lapses,
    lastReview: nowMs,
    due,
  };

  return { state: next, intervalDays };
}

/**
 * Estimates the interval each rating would produce, without applying the
 * schedule. Used for the "<10m / 1d / 3d / 6d" labels on the rating buttons.
 *
 * Aceita `SchedulingState` (não Flashcard inteiro) — quem chama passa
 * o state apropriado: state raiz pra cards non-cloze, `clozeStates[key]`
 * pra cards multi-cloze. Útil pra mostrar previews diferentes pra cada
 * chave de um cartão multi-cloze.
 */
export function previewIntervals(
  state: SchedulingState,
  nowMs: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const { intervalDays } = scheduleState(state, r, nowMs, config);
    if (r === 1) {
      out[r] = config.lapseMinutes < 60
        ? `<${config.lapseMinutes}m`
        : `${Math.round(config.lapseMinutes / 60)}h`;
    } else if (intervalDays < 1) out[r] = '<1d';
    else if (intervalDays < 30) out[r] = `${intervalDays}d`;
    else if (intervalDays < 365) out[r] = `${Math.round(intervalDays / 30)}mo`;
    else out[r] = `${Math.round(intervalDays / 365)}a`;
  }
  return out;
}

export function newCardDefaults(): Pick<
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
> {
  return {
    state: 'new',
    due: Date.now(),
    stability: 0,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    ease: DEFAULT_SCHEDULER_CONFIG.startingEase,
  };
}
