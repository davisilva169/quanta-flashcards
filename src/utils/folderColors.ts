/**
 * Color tokens for folders & decks.
 *
 * The schema field is still called `colorKey` for backward compat, but it
 * now accepts EITHER:
 *   - a CSS hex color string ("#a78bfa")
 *   - a legacy preset key ("violet", "cyan", ...) that we map to a hex.
 *
 * `resolveColor()` makes consumers agnostic to the storage form.
 *
 * Components apply colors via inline `style` (border / icon color / chip),
 * not Tailwind classes. The user picks freely from a color input;
 * `COLOR_PRESETS` is just a row of one-tap shortcuts.
 *
 * Names are always rendered in `text-primary` — the per-folder
 * color is reserved for the icon and the border accent.
 */

export interface ResolvedColor {
  /** CSS hex string, e.g. "#a78bfa". */
  hex: string;
  /** Optional human label — only set for named presets. */
  label?: string;
}

/**
 * Eight curated presets. Hex chosen so they read well on a dark background
 * (Tailwind 300/400 lightness range).
 */
export const COLOR_PRESETS: ResolvedColor[] = [
  { hex: '#a78bfa', label: 'Violeta' },
  { hex: '#67e8f9', label: 'Ciano' },
  { hex: '#6ee7b7', label: 'Verde' },
  { hex: '#93c5fd', label: 'Azul' },
  { hex: '#fcd34d', label: 'Âmbar' },
  { hex: '#fda4af', label: 'Rosa' },
  { hex: '#a5b4fc', label: 'Índigo' },
  { hex: '#cbd5e1', label: 'Neutro' },
];

/** Legacy → hex map used when reading old data that stored e.g. "violet". */
const LEGACY_KEYS: Record<string, string> = {
  violet: '#a78bfa',
  cyan: '#67e8f9',
  emerald: '#6ee7b7',
  blue: '#93c5fd',
  amber: '#fcd34d',
  rose: '#fda4af',
  indigo: '#a5b4fc',
  slate: '#cbd5e1',
};

export const DEFAULT_COLOR = '#a78bfa';
/** Kept under the old name so existing imports compile. */
export const DEFAULT_COLOR_KEY = DEFAULT_COLOR;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function resolveColor(value: string | undefined): ResolvedColor {
  if (!value) return { hex: DEFAULT_COLOR };
  if (HEX_RE.test(value)) return { hex: normalizeHex(value) };
  if (LEGACY_KEYS[value]) return { hex: LEGACY_KEYS[value] };
  return { hex: DEFAULT_COLOR };
}

/**
 * Compatibility shim. Old code called `colorByKey(folder.colorKey)` and
 * accessed `.text`, `.bgSoft`, `.border`, `.hex`. We now expose only `.hex`
 * and let consumers build inline styles. Kept exported so any stragglers
 * still resolve.
 */
export function colorByKey(value: string | undefined): ResolvedColor {
  return resolveColor(value);
}

function normalizeHex(value: string): string {
  // Expand short form #abc → #aabbcc
  if (value.length === 4) {
    const r = value[1], g = value[2], b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value.toLowerCase();
}

/**
 * Convert a hex string to an `rgba(...)` string with the given alpha.
 * Use this for tinted backgrounds: `withAlpha(color.hex, 0.1)`.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = normalizeHex(hex);
  const h = value.slice(1);
  // Handle 8-char (with alpha) by ignoring its alpha byte
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}
