/**
 * REVIEW SHORTCUTS — KEY MAP, MATCHING, AND DISPLAY HELPERS
 * ============================================================================
 *
 * The review & rush sessions used to compare `e.key === '1'` directly inside
 * the listeners. To let the user remap keys, we centralize:
 *
 *   - `ShortcutMap`: the schema persisted in Settings.
 *   - `DEFAULT_SHORTCUTS`: built-in defaults that preserve the legacy keys
 *     (Space / 1 / 2 / 3 / 4 / R / Esc / Enter). Migrating users land here
 *     and notice nothing.
 *   - `matchShortcut(e, key)`: the gatekeeper. Returns true only for the
 *     specific key, with no modifiers (Ctrl/Cmd/Alt). Comparison is
 *     case-insensitive for letter keys so the user doesn't have to think
 *     about caps lock.
 *   - `formatShortcut(key)`: turns the raw `KeyboardEvent.key` string into
 *     a human label ('Espaço', 'Esc', 'R', '1') for the Settings UI.
 *   - `captureKey(e)`: normalizes a captured KeyboardEvent into a storable
 *     key string, plus a rejection reason if the key isn't acceptable.
 *   - `findConflict(map, action, candidate)`: returns the other action
 *     name (if any) that already binds the same key, so the editor can
 *     warn before committing.
 *
 * Design choices
 *   - No modifiers (Ctrl/Shift/Alt/Cmd). Adds UX complexity and risks
 *     stomping browser shortcuts. Future fase can revisit.
 *   - The persisted value IS the raw `KeyboardEvent.key` lower-cased for
 *     letters. ' ' for Space, 'Escape', 'Enter', '1'-'4', 'r', etc. This
 *     is stable across keyboard layouts (`.key` reports the typed
 *     character, not the physical key code).
 *   - Settings.shortcuts is optional: missing → DEFAULT_SHORTCUTS at read
 *     time. Old settings rows backfill to defaults in `ensureInitialized`.
 *
 * What this module deliberately does NOT do
 *   - It does not register listeners. Each page owns its own `useEffect`
 *     keyboard handler and uses `matchShortcut` to gate dispatch.
 *   - It does not enforce non-editable focus. Pages must still skip when
 *     `e.target` is an INPUT / TEXTAREA / contenteditable — same rule
 *     that already lives in ReviewPage and InteractiveCardBody. This
 *     module isn't in the right place to know about focus.
 * ============================================================================
 */

/** Identifier of every remappable action. Used as the key in the map. */
export type ShortcutAction =
  | 'reveal'
  | 'rateAgain'
  | 'rateHard'
  | 'rateGood'
  | 'rateEasy'
  | 'toggleNarration'
  | 'exit'
  | 'advance';

export type ShortcutMap = Record<ShortcutAction, string>;

/** Built-in defaults. Preserve the legacy keys verbatim — existing users
 *  don't notice a thing on first run after this feature ships. */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  reveal: ' ',
  rateAgain: '1',
  rateHard: '2',
  rateGood: '3',
  rateEasy: '4',
  toggleNarration: 'r',
  exit: 'Escape',
  advance: 'Enter',
};

/** Human label for each action, for the Settings UI. */
export const ACTION_LABELS: Record<ShortcutAction, string> = {
  reveal: 'Revelar resposta',
  rateAgain: 'Errei',
  rateHard: 'Difícil',
  rateGood: 'Bom',
  rateEasy: 'Fácil',
  toggleNarration: 'Tocar/parar narração',
  exit: 'Sair da revisão',
  advance: 'Avançar (no Rush)',
};

/** Short hint under the action label in the Settings UI. */
export const ACTION_HINTS: Record<ShortcutAction, string> = {
  reveal: 'Mostra a resposta em cartões clássicos.',
  rateAgain: 'Marca o cartão para revisão imediata.',
  rateHard: 'Marca o cartão como difícil.',
  rateGood: 'Marca como bem respondido.',
  rateEasy: 'Marca como fácil; intervalo maior.',
  toggleNarration: 'Disponível em cartões com narração configurada.',
  exit: 'Sai da sessão de revisão ou de Rush.',
  advance: 'Avança para o próximo cartão na sessão de Rush.',
};

/**
 * Compare a `KeyboardEvent` against a stored shortcut key.
 *
 * Rejects modifier presses (Ctrl/Cmd/Alt) so the user can still do things
 * like Cmd-R to refresh the dev page without triggering "play narration".
 * Shift is allowed because Shift is part of how some characters get typed
 * (and removing it from `key` would just match the bare key).
 */
export function matchShortcut(e: KeyboardEvent, key: string): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const got = e.key;
  // Letters case-insensitive so caps lock isn't a footgun. Other keys
  // ('1', ' ', 'Escape', 'Enter') compare exactly.
  if (got.length === 1 && key.length === 1) {
    return got.toLowerCase() === key.toLowerCase();
  }
  return got === key;
}

/** Display a stored shortcut key as a short, friendly label. */
export function formatShortcut(key: string): string {
  if (key === ' ') return 'Espaço';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return 'Enter';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key === 'Tab') return 'Tab';
  if (key === 'Backspace') return '⌫';
  if (key.length === 1) return key.toUpperCase();
  // Any unexpected key name (F-keys, etc) just shows as is.
  return key;
}

/**
 * Normalize a captured `KeyboardEvent` into either a usable shortcut key
 * string or a rejection reason.
 *
 * Rules:
 *   - Modifier-only presses (just Shift, just Ctrl, etc) are rejected —
 *     the user pressed but didn't really pick anything.
 *   - Modifiers attached to the key (Ctrl-S, Cmd-Shift-A) are rejected:
 *     we don't support modifier-bound shortcuts in this phase, and
 *     accidentally binding to a system shortcut is bad UX.
 *   - Tab is rejected because Tab moves focus and would lock the user
 *     out of the capture dialog.
 *   - F1-F12 and arrows are allowed.
 *   - Letters are lower-cased for storage; we match case-insensitively.
 */
export function captureKey(
  e: KeyboardEvent,
): { ok: true; key: string } | { ok: false; reason: string } {
  if (e.ctrlKey || e.metaKey || e.altKey) {
    return {
      ok: false,
      reason: 'Atalhos com Ctrl, Cmd ou Alt não são suportados nesta versão.',
    };
  }
  if (e.key === 'Tab') {
    return {
      ok: false,
      reason: 'Tab é reservado para navegação. Escolha outra tecla.',
    };
  }
  // Pure modifier presses (the user pressed only Shift, Caps, etc).
  if (
    e.key === 'Shift' ||
    e.key === 'Control' ||
    e.key === 'Alt' ||
    e.key === 'Meta' ||
    e.key === 'CapsLock'
  ) {
    return {
      ok: false,
      reason: 'Pressione uma tecla principal (letra, número, espaço, etc).',
    };
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return { ok: true, key };
}

/** If `candidate` is already bound to another action in the map, return
 *  that action. Otherwise null. The action being edited is excluded so
 *  re-confirming the current binding isn't reported as a self-conflict. */
export function findConflict(
  map: ShortcutMap,
  editing: ShortcutAction,
  candidate: string,
): ShortcutAction | null {
  for (const action of Object.keys(map) as ShortcutAction[]) {
    if (action === editing) continue;
    if (sameKey(map[action], candidate)) return action;
  }
  return null;
}

function sameKey(a: string, b: string): boolean {
  if (a.length === 1 && b.length === 1) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/**
 * Merge a stored (possibly partial / legacy) ShortcutMap with defaults so
 * consumers always get a complete map. Use this everywhere instead of
 * indexing `settings.shortcuts` directly.
 */
export function resolveShortcuts(
  stored: Partial<ShortcutMap> | undefined,
): ShortcutMap {
  return { ...DEFAULT_SHORTCUTS, ...(stored ?? {}) };
}
