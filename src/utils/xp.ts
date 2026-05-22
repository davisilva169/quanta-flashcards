import type { Rating } from '@/types/review';
import type { UserStats } from '@/types/stats';
import { todayKey } from './dates';
import { rankForLevel } from './ranks';

// ────────────────────────────────────────────────────────────────────────────
// XP rewards per action.
// Tunable: edit these constants if you want a softer/harder economy.
// ────────────────────────────────────────────────────────────────────────────
export const XP_PER_REVIEW = 10;
export const XP_HARD_BONUS = 5;
export const XP_DAILY_GOAL = 50;
export const XP_WEEKLY_STREAK = 100;

// ────────────────────────────────────────────────────────────────────────────
// Non-linear leveling
//
// XP needed *to advance from* level n to n+1:
//   xpRequiredToAdvance(n) = floor( XP_GROWTH_A * n^XP_GROWTH_EXP + XP_GROWTH_B * n )
//
// Defaults from product spec: 150*n^2.25 + 100*n
//   n=1  →     250 XP
//   n=2  →     913 XP
//   n=3  →   2.042 XP
//   n=5  →   6.202 XP
//   n=10 →  27.672 XP
//   n=20 → 138.000 XP
// Cumulative thresholds grow even faster — level 50 is intentionally a long
// haul, level 100 is asymptotic.
//
// Tuning hint: lower XP_GROWTH_EXP (e.g. 1.9) for a much gentler curve.
// ────────────────────────────────────────────────────────────────────────────
export const XP_GROWTH_A = 150;
export const XP_GROWTH_EXP = 2.25;
export const XP_GROWTH_B = 100;
export const MAX_LEVEL_CACHE = 200;

/** XP required to advance from level `n` to level `n+1`. */
export function xpRequiredToAdvance(n: number): number {
  if (n < 1) return 0;
  return Math.floor(XP_GROWTH_A * Math.pow(n, XP_GROWTH_EXP) + XP_GROWTH_B * n);
}

const _thresholdCache: number[] = [0, 0]; // index = level; cache[1] = 0
function ensureCache(upTo: number) {
  for (let lvl = _thresholdCache.length; lvl <= upTo + 1; lvl++) {
    _thresholdCache[lvl] = _thresholdCache[lvl - 1] + xpRequiredToAdvance(lvl - 1);
  }
}
ensureCache(MAX_LEVEL_CACHE);

export function xpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  ensureCache(level);
  return _thresholdCache[level];
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  ensureCache(MAX_LEVEL_CACHE);
  let lvl = 1;
  while (lvl < _thresholdCache.length - 1 && _thresholdCache[lvl + 1] <= xp) lvl++;
  return lvl;
}

/** Backwards-compat alias. */
export const xpForLevel = xpThresholdForLevel;

export function progressToNextLevel(xp: number) {
  const level = levelFromXp(xp);
  const base = xpThresholdForLevel(level);
  const next = xpThresholdForLevel(level + 1);
  const current = xp - base;
  const needed = next - base;
  return {
    level,
    current,
    needed,
    ratio: needed > 0 ? current / needed : 1,
    totalXp: xp,
    rank: rankForLevel(level),
    nextLevelAt: next,
  };
}

/**
 * - Errei (1):    0 XP
 * - Difícil (2): base + bônus
 * - Bom (3):     base
 * - Fácil (4):   base
 */
export function xpFromRating(rating: Rating): number {
  if (rating === 1) return 0;
  if (rating === 2) return XP_PER_REVIEW + XP_HARD_BONUS;
  return XP_PER_REVIEW;
}

export interface BonusResult {
  stats: UserStats;
  bonuses: string[];
  leveledUp: boolean;
  rankedUp: boolean;
  previousLevel: number;
  newLevel: number;
}

export function applyBonuses(
  stats: UserStats,
  reviewsToday: number,
  dailyGoal: number,
): BonusResult {
  const previousLevel = levelFromXp(stats.xp);
  let updated = { ...stats };
  const bonuses: string[] = [];
  const today = todayKey();

  if (
    reviewsToday >= dailyGoal &&
    updated.bonusFlags.completedToday !== today
  ) {
    updated = {
      ...updated,
      xp: updated.xp + XP_DAILY_GOAL,
      bonusFlags: { ...updated.bonusFlags, completedToday: today },
    };
    bonuses.push(`+${XP_DAILY_GOAL} XP — meta diária concluída.`);
  }

  if (
    updated.streakDays > 0 &&
    updated.streakDays % 7 === 0 &&
    updated.bonusFlags.streakWeeklyAt !== updated.streakDays
  ) {
    updated = {
      ...updated,
      xp: updated.xp + XP_WEEKLY_STREAK,
      bonusFlags: {
        ...updated.bonusFlags,
        streakWeeklyAt: updated.streakDays,
      },
    };
    bonuses.push(`+${XP_WEEKLY_STREAK} XP — sequência de ${updated.streakDays} dias.`);
  }

  const newLevel = levelFromXp(updated.xp);
  const leveledUp = newLevel > previousLevel;
  const rankedUp =
    leveledUp &&
    rankForLevel(previousLevel).title !== rankForLevel(newLevel).title;

  if (leveledUp) {
    bonuses.push(
      rankedUp
        ? `Novo posto: ${rankForLevel(newLevel).title}.`
        : `Subiu para o nível ${newLevel}.`,
    );
  }

  return { stats: updated, bonuses, leveledUp, rankedUp, previousLevel, newLevel };
}
