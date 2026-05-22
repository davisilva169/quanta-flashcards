/**
 * STATS ANALYSIS
 * ============================================================================
 * Pure functions powering the floating Stats panels. Everything here takes
 * the raw data (cards, logs, decks, folders) as input and returns derived
 * shapes — no DB access, no React, no side effects. That lets each panel
 * pass its current Scope+Period filters and get back the right slice.
 *
 * The data underneath (reviewLogs, card states, XP, streak) is unchanged —
 * we just query it more deeply.
 * ============================================================================
 */

import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import { now, toDayKey } from './dates';

// ── Filter types ─────────────────────────────────────────────────────────────

/**
 * Scope selector. Either everything, all decks inside a given folder, or a
 * single deck. The dropdown in PanelFilters maps directly to this shape.
 */
export type StatsScope =
  | { kind: 'all' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'deck'; deckId: string };

/**
 * Time window. Numeric values are trailing-day counts ending NOW; `'all'`
 * means since the beginning of time.
 */
export type StatsPeriod = 7 | 30 | 90 | 365 | 'all';

export const PERIOD_LABELS: Record<string, string> = {
  '7': 'Últimos 7 dias',
  '30': 'Último mês',
  '90': 'Últimos 3 meses',
  '365': 'Último ano',
  all: 'Todo o tempo',
};

// ── Filtering ────────────────────────────────────────────────────────────────

/**
 * Returns the cutoff timestamp (inclusive lower bound) for a given period.
 * For `'all'` returns 0 — caller still treats `ts >= cutoff` correctly.
 */
export function periodCutoff(period: StatsPeriod): number {
  if (period === 'all') return 0;
  return now() - period * 24 * 60 * 60 * 1000;
}

/**
 * Returns deck IDs included by a scope. For `'all'`, every deck. For folder,
 * every deck whose `folderId` matches. For deck, just that one id.
 *
 * `decks` is passed in (not fetched) so callers can memoize this.
 */
export function deckIdsForScope(scope: StatsScope, decks: Deck[]): Set<string> {
  if (scope.kind === 'all') return new Set(decks.map(d => d.id));
  if (scope.kind === 'deck') return new Set([scope.deckId]);
  return new Set(
    decks.filter(d => d.folderId === scope.folderId).map(d => d.id),
  );
}

/**
 * Filter logs by scope AND period. The logs param is the full reviewLogs
 * array; the function returns a freshly filtered subset (no mutation).
 */
export function filterLogs(
  logs: ReviewLog[],
  decks: Deck[],
  scope: StatsScope,
  period: StatsPeriod,
): ReviewLog[] {
  const cutoff = periodCutoff(period);
  const allowedDecks = deckIdsForScope(scope, decks);
  return logs.filter(
    l => l.reviewedAt >= cutoff && allowedDecks.has(l.deckId),
  );
}

/** Filter cards by scope. (Period doesn't apply — cards are always "now".) */
export function filterCards(
  cards: Flashcard[],
  decks: Deck[],
  scope: StatsScope,
): Flashcard[] {
  const allowedDecks = deckIdsForScope(scope, decks);
  return cards.filter(c => allowedDecks.has(c.deckId));
}

// ── Aggregations: counts ─────────────────────────────────────────────────────

/**
 * Card counts by state — the "Por estado" breakdown shown in the RevisionsPanel.
 *
 *   novo        — never reviewed (state 'new' or reps === 0)
 *   aprendendo  — first repetitions (state 'learning' or 'relearning')
 *   jovem       — graduated (state 'review'), scheduled interval < MATURE_DAYS
 *   maduro      — graduated (state 'review'), scheduled interval >= MATURE_DAYS
 *
 * The four buckets are mutually exclusive and sum to `total` — the panel's UI
 * presents them as a 4-tile breakdown, so this contract matters.
 *
 * NOTE: this deliberately does NOT use `categorize()` from utils/stats.ts.
 * That function answers a different question (deck health, where
 * "problemático" is an independent quality dimension that overlaps with
 * jovem/maduro), and folds learning/relearning into jovem/problemático. Using
 * it here left `aprendendo` permanently at 0 — the bug fixed by going back
 * to the underlying card.state field.
 */
export interface StateBreakdown {
  novo: number;
  aprendendo: number;
  jovem: number;
  maduro: number;
  total: number;
}

/** Maturity threshold in days. Mirrors the value used elsewhere in stats. */
const MATURE_DAYS = 21;

export function breakdownByState(cards: Flashcard[]): StateBreakdown {
  const acc: StateBreakdown = {
    novo: 0,
    aprendendo: 0,
    jovem: 0,
    maduro: 0,
    total: cards.length,
  };
  for (const c of cards) {
    // Order matters: a card with reps === 0 should count as "novo" even if
    // its `state` field somehow drifted. Treat reps as authoritative for
    // "has this card ever been graded?".
    if (c.reps === 0 || c.state === 'new') {
      acc.novo += 1;
    } else if (c.state === 'learning' || c.state === 'relearning') {
      acc.aprendendo += 1;
    } else if (c.scheduledDays >= MATURE_DAYS) {
      acc.maduro += 1;
    } else {
      acc.jovem += 1;
    }
  }
  return acc;
}

/** Count of each rating (1=Errei .. 4=Fácil) over a filtered log set. */
export interface RatingBreakdown {
  errei: number;   // 1
  dificil: number; // 2
  bom: number;     // 3
  facil: number;   // 4
  total: number;
}

export function breakdownByRating(logs: ReviewLog[]): RatingBreakdown {
  const acc: RatingBreakdown = {
    errei: 0,
    dificil: 0,
    bom: 0,
    facil: 0,
    total: logs.length,
  };
  for (const l of logs) {
    if (l.rating === 1) acc.errei += 1;
    else if (l.rating === 2) acc.dificil += 1;
    else if (l.rating === 3) acc.bom += 1;
    else if (l.rating === 4) acc.facil += 1;
  }
  return acc;
}

// ── Aggregations: time series ────────────────────────────────────────────────

export interface DailyPoint {
  /** YYYY-MM-DD (toDayKey). */
  day: string;
  /** Timestamp of midnight of that day, for sorting / cell positioning. */
  ts: number;
  /** Number of review logs on that day within the filtered set. */
  count: number;
  /** Total time spent reviewing on that day, in ms. */
  totalMs: number;
}

/**
 * Bucket filtered logs into per-day rows. The output array spans EVERY day
 * in [start, end], not just the days that had reviews — empty days are
 * present with count=0. That makes charts and heatmaps straightforward.
 *
 * For `period === 'all'` with no logs at all, returns an empty array.
 */
export function dailySeries(
  logs: ReviewLog[],
  period: StatsPeriod,
): DailyPoint[] {
  if (logs.length === 0 && period === 'all') return [];

  // Decide the window. For 'all', start at the earliest log we have so the
  // series doesn't contain hundreds of empty leading days.
  const endTs = now();
  let startTs: number;
  if (period === 'all') {
    startTs = Math.min(...logs.map(l => l.reviewedAt));
  } else {
    startTs = endTs - period * 24 * 60 * 60 * 1000;
  }
  // Normalize to day boundaries.
  const startDay = new Date(startTs);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(endTs);
  endDay.setHours(0, 0, 0, 0);

  // Pre-bucket logs by day-key for O(N) lookup.
  type Bucket = { count: number; totalMs: number };
  const byDay = new Map<string, Bucket>();
  for (const l of logs) {
    const k = toDayKey(l.reviewedAt);
    const b = byDay.get(k) ?? { count: 0, totalMs: 0 };
    b.count += 1;
    b.totalMs += l.durationMs ?? 0;
    byDay.set(k, b);
  }

  // Walk each day in the window. `setDate(+1)` handles month/year rollover
  // correctly in all locales (Windows tz included).
  const out: DailyPoint[] = [];
  const cursor = new Date(startDay);
  while (cursor.getTime() <= endDay.getTime()) {
    const ts = cursor.getTime();
    const key = toDayKey(ts);
    const b = byDay.get(key) ?? { count: 0, totalMs: 0 };
    out.push({ day: key, ts, count: b.count, totalMs: b.totalMs });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

export interface HeatmapCell extends DailyPoint {
  /** 0..6, Sunday=0. */
  weekday: number;
  /** Column index in the grid (0 = leftmost). */
  weekIndex: number;
}

/**
 * Convert a daily series into a GitHub-style calendar grid.
 *
 * Columns are weeks (left=oldest, right=most-recent). Rows are weekdays
 * (Sun..Sat). Cells with no data are present with count=0 so the grid
 * is rectangular.
 */
export function heatmapCells(series: DailyPoint[]): HeatmapCell[] {
  if (series.length === 0) return [];
  // The first column may start mid-week. We align by the Sunday on or
  // before the first day, so all rows align horizontally as expected.
  const firstDate = new Date(series[0].ts);
  const firstSunday = new Date(firstDate);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

  const out: HeatmapCell[] = [];
  for (const p of series) {
    const d = new Date(p.ts);
    const daysSinceFirstSunday = Math.floor(
      (d.getTime() - firstSunday.getTime()) / (24 * 60 * 60 * 1000),
    );
    const weekIndex = Math.floor(daysSinceFirstSunday / 7);
    const weekday = d.getDay();
    out.push({ ...p, weekIndex, weekday });
  }
  return out;
}

/**
 * For a heatmap, the number of distinct active days (count > 0) and the
 * longest gap (consecutive days with count = 0).
 */
export interface ActivityFacts {
  activeDays: number;
  totalDays: number;
  longestGap: number;
}

export function activityFacts(series: DailyPoint[]): ActivityFacts {
  let active = 0;
  let currentGap = 0;
  let longest = 0;
  for (const p of series) {
    if (p.count > 0) {
      active += 1;
      longest = Math.max(longest, currentGap);
      currentGap = 0;
    } else {
      currentGap += 1;
    }
  }
  longest = Math.max(longest, currentGap);
  return { activeDays: active, totalDays: series.length, longestGap: longest };
}

// ── Streak (filtered) ────────────────────────────────────────────────────────

/**
 * The user's current consecutive-active-days streak based on the filtered
 * series. Counts back from today (or yesterday if today has zero reviews —
 * a one-day grace so streaks don't break mid-day).
 *
 * NOTE: this re-derives streak from logs. The userStats.streak field is
 * still the canonical "global" streak; this version answers questions
 * like "what's my streak just for deck X?".
 */
export function streakFromSeries(series: DailyPoint[]): {
  current: number;
  best: number;
} {
  if (series.length === 0) return { current: 0, best: 0 };

  let best = 0;
  let run = 0;
  for (const p of series) {
    if (p.count > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  // Current streak: count back from the LAST day. If the last day has 0 but
  // is "today" (within a day), look one back — same grace as utils/streak.ts.
  let current = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].count > 0) current += 1;
    else if (i === series.length - 1 && series[i].count === 0) {
      // today is empty — try yesterday
      continue;
    } else break;
  }
  return { current, best };
}

// ── Accuracy ─────────────────────────────────────────────────────────────────

/**
 * Generic accuracy: fraction of reviews graded ≥ 3 (Bom/Fácil).
 *
 * Returns 0 if `logs` is empty (caller should display "—" rather than 0%).
 */
export function accuracy(logs: ReviewLog[]): number {
  if (logs.length === 0) return 0;
  const good = logs.filter(l => l.rating >= 3).length;
  return good / logs.length;
}

/**
 * "True retention" — accuracy on reviews where the card was already
 * graduated (state 'review' or 'relearning') BEFORE the rating. This is
 * the metric Anki users actually care about: it's not penalized by the
 * initial-learning churn, so it reflects how well you're holding cards
 * once they've left the learning phase.
 */
export function trueRetention(logs: ReviewLog[]): number {
  const eligible = logs.filter(
    l => l.prevState === 'review' || l.prevState === 'relearning',
  );
  if (eligible.length === 0) return 0;
  const good = eligible.filter(l => l.rating >= 3).length;
  return good / eligible.length;
}

// ── Time ─────────────────────────────────────────────────────────────────────

export interface TimeFacts {
  totalMs: number;
  /** Mean over days that had ANY activity (not over the whole window). */
  meanPerActiveDayMs: number;
  /** Single longest day. */
  longestDayMs: number;
  /** Mean session = mean of per-log durationMs. */
  meanPerSessionMs: number;
}

export function timeFacts(
  series: DailyPoint[],
  logs: ReviewLog[],
): TimeFacts {
  const active = series.filter(s => s.count > 0);
  const total = series.reduce((s, p) => s + p.totalMs, 0);
  const meanDay = active.length === 0 ? 0 : total / active.length;
  const longest = series.reduce((m, p) => Math.max(m, p.totalMs), 0);
  const sessionDurations = logs
    .map(l => l.durationMs ?? 0)
    .filter(d => d > 0);
  const meanSession =
    sessionDurations.length === 0
      ? 0
      : sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length;
  return {
    totalMs: total,
    meanPerActiveDayMs: meanDay,
    longestDayMs: longest,
    meanPerSessionMs: meanSession,
  };
}

/** Format a ms duration as "1h 23min" / "12min" / "—". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) {
    const sec = Math.round(ms / 1000);
    return `${sec}s`;
  }
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// ── Interval distribution ────────────────────────────────────────────────────

/**
 * Histogram of CURRENT scheduled intervals for the filtered card set —
 * "how spread out is my review schedule?". Buckets are chosen to be human
 * readable and to map nicely to maturity terms (the existing app uses 21d
 * as the maturity threshold).
 */
export interface IntervalBucket {
  label: string;
  min: number; // inclusive, in days
  max: number; // exclusive (Infinity for the last bucket)
  count: number;
}

export function intervalDistribution(cards: Flashcard[]): IntervalBucket[] {
  const buckets: IntervalBucket[] = [
    { label: 'Novo',     min: -Infinity, max: 1, count: 0 },
    { label: '1–3 d',    min: 1,         max: 4, count: 0 },
    { label: '4–7 d',    min: 4,         max: 8, count: 0 },
    { label: '1–3 sem',  min: 8,         max: 22, count: 0 },
    { label: '3–8 sem',  min: 22,        max: 57, count: 0 },
    { label: '2–6 m',    min: 57,        max: 180, count: 0 },
    { label: '6m+',      min: 180,       max: Infinity, count: 0 },
  ];
  for (const c of cards) {
    const i = c.scheduledDays ?? 0;
    const bucket = buckets.find(b => i >= b.min && i < b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}
