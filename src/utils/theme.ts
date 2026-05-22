/**
 * THEME — single source of truth for theme application.
 * ============================================================================
 * Quanta has three theme modes (`ThemeMode` in types/stats.ts):
 *   'light'  → always light
 *   'dark'   → always dark
 *   'system' → follows the OS (`prefers-color-scheme`)
 *
 * The *effective* theme (what actually paints) is light or dark. For 'system'
 * it's resolved at apply-time and re-resolved whenever the OS preference
 * changes (see `initTheme`).
 *
 * How it stays consistent — the three places theme is touched, and the ONE
 * rule that keeps them honest:
 *   1. index.html inline script — paints the first frame from localStorage.
 *   2. App.tsx on boot — calls `initTheme(settings.theme)` from the DB.
 *   3. SettingsPage — calls `setTheme(mode)` when the user picks one.
 *
 *   THE RULE: every persisted theme change goes through `setTheme`, which
 *   writes BOTH the DB (via the callback) AND localStorage. The inline
 *   script reads localStorage; App.tsx reads the DB; they can't diverge
 *   because `setTheme` is the only writer and writes both.
 *
 * Applying the theme = toggling the `dark` class on <html>. The CSS in
 * styles/index.css does the rest (`:root` = light, `html.dark` = dark).
 * ============================================================================
 */

import type { ThemeMode } from '@/types/stats';

const STORAGE_KEY = 'quanta:theme';
const DARK_CLASS = 'dark';

export type EffectiveTheme = 'light' | 'dark';

/** Does the OS currently prefer dark? Safe if matchMedia is unavailable. */
function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Resolve a mode to the concrete theme that should paint right now. */
export function resolveEffective(mode: ThemeMode): EffectiveTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemPrefersDark() ? 'dark' : 'light';
}

/**
 * Apply a mode to the document — toggles the `dark` class on <html>.
 * Idempotent. Does NOT persist anything (see `setTheme` for that).
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const effective = resolveEffective(mode);
  document.documentElement.classList.toggle(DARK_CLASS, effective === 'dark');
}

/** Read the cached mode from localStorage. Defaults to 'system'. */
export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage blocked */
  }
  return 'system';
}

/**
 * Persist + apply a theme change. This is the ONLY function that should be
 * called when the user picks a theme.
 *
 * @param mode    the chosen mode
 * @param persist optional async callback to write the DB (Settings). Called
 *                fire-and-forget; localStorage + DOM are updated synchronously
 *                so the UI reacts instantly.
 */
export function setTheme(
  mode: ThemeMode,
  persist?: (mode: ThemeMode) => void | Promise<void>,
): void {
  applyTheme(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage blocked — DB write below is still the durable record */
  }
  persist?.(mode);
}

/**
 * Boot-time initialization. Applies `mode`, syncs the localStorage cache to
 * it (so the next launch's inline script is correct), and — if the mode is
 * 'system' — attaches a listener so the app repaints live when the OS theme
 * changes. Returns a cleanup function (detach the listener).
 *
 * Call once from App.tsx with the mode read from Settings.
 */
export function initTheme(mode: ThemeMode): () => void {
  applyTheme(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }

  if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => applyTheme('system');

  // Modern browsers: addEventListener. Older WebViews: addListener.
  // `addListener`/`removeListener` foram deprecated mas continuam tipados
  // na lib do TypeScript moderna — não precisamos mais de @ts-expect-error.
  if (mql.addEventListener) {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}
