/**
 * Utilitários de data — todos baseados em UTC do navegador, suficientes
 * para um app single-user local.
 */

export function now(): number {
  return Date.now();
}

export function toDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDayKey(now());
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysFromNow(days: number): number {
  return now() + days * 24 * 60 * 60 * 1000;
}

export function formatRelative(ts: number): string {
  const diff = ts - now();
  const absDays = Math.round(diff / (1000 * 60 * 60 * 24));
  if (absDays === 0) return 'hoje';
  if (absDays === 1) return 'amanhã';
  if (absDays === -1) return 'ontem';
  if (absDays > 0) return `em ${absDays} dias`;
  return `há ${-absDays} dias`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(toDayKey(now() - i * 24 * 60 * 60 * 1000));
  }
  return out;
}
