import { daysBetween, todayKey } from './dates';
import type { UserStats } from '@/types/stats';

/**
 * Recalcula o streak ao registrar uma revisão.
 * - Se já estudou hoje, nada muda.
 * - Se estudou ontem, incrementa.
 * - Caso contrário, reinicia em 1.
 */
export function bumpStreak(stats: UserStats): UserStats {
  const today = todayKey();
  if (stats.lastStudyDate === today) return stats;

  let newStreak = 1;
  if (stats.lastStudyDate) {
    const gap = daysBetween(stats.lastStudyDate, today);
    if (gap === 1) newStreak = stats.streakDays + 1;
  }

  return {
    ...stats,
    streakDays: newStreak,
    longestStreak: Math.max(stats.longestStreak, newStreak),
    lastStudyDate: today,
  };
}

/**
 * Verifica se o streak atual já foi quebrado (passou mais de 1 dia desde
 * a última revisão). Útil ao abrir o app.
 */
export function decayedStreak(stats: UserStats): UserStats {
  if (!stats.lastStudyDate) return stats;
  const gap = daysBetween(stats.lastStudyDate, todayKey());
  if (gap > 1) {
    return { ...stats, streakDays: 0 };
  }
  return stats;
}
