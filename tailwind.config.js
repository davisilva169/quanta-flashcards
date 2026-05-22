/** @type {import('tailwindcss').Config} */

/*
 * ============================================================================
 * QUANTA — THEME FOUNDATION
 * ----------------------------------------------------------------------------
 * Theme-first design. Every color a component can use is a SEMANTIC TOKEN
 * here, backed by a CSS variable defined in src/styles/index.css.
 *
 *   :root        → LIGHT theme (the default)
 *   html.dark    → DARK theme
 *
 * A component NEVER writes `bg-zinc-900` or `text-white`. It writes
 * `bg-surface` / `text-primary`. The same class produces a light or dark
 * result depending on which variable set is active. This is what makes the
 * light theme a first-class citizen instead of an afterthought.
 *
 * Token groups:
 *   - surfaces:  app, surface, surface-2, card, card-hover, elevated, input
 *   - text:      primary, secondary, muted, faint, inverse, on-accent
 *   - borders:   subtle, divider, strong
 *   - accent:    accent (DEFAULT + 50..900 scale), accent-fg, accent-soft
 *   - semantic:  success, warning, danger, info  (each + -soft + -fg)
 *
 * The `<alpha-value>` placeholder lets Tailwind generate `/50` opacity
 * variants correctly (e.g. `bg-card/60`). That requires the CSS variables
 * to hold raw `R G B` triplets, not `rgb(...)` strings.
 * ============================================================================
 */

const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },

      colors: {
        // ── Surfaces ──────────────────────────────────────────────────────
        // app:        the window background — the darkest tone in light,
        //             the deepest tone in dark. The "floor".
        // surface:    sidebar, top-level panels.
        // surface-2:  a slightly recessed surface (section backgrounds).
        // card:       cards sitting on the floor.
        // card-hover: card hover state.
        // elevated:   modals, popovers, dropdowns.
        // input:      form fields.
        app: withAlpha('--bg-app'),
        surface: withAlpha('--bg-surface'),
        'surface-2': withAlpha('--bg-surface-2'),
        card: withAlpha('--bg-card'),
        'card-hover': withAlpha('--bg-card-hover'),
        elevated: withAlpha('--bg-elevated'),
        input: withAlpha('--bg-input'),

        // ── Text ──────────────────────────────────────────────────────────
        primary: withAlpha('--text-primary'),
        secondary: withAlpha('--text-secondary'),
        muted: withAlpha('--text-muted'),
        faint: withAlpha('--text-faint'),
        inverse: withAlpha('--text-inverse'),
        'on-accent': withAlpha('--text-on-accent'),

        // ── Borders ───────────────────────────────────────────────────────
        subtle: withAlpha('--border-subtle'),
        divider: withAlpha('--border-divider'),
        strong: withAlpha('--border-strong'),

        // ── Accent (indigo-violet) ────────────────────────────────────────
        // `accent` with a DEFAULT + numeric scale. The scale is fixed (brand
        // identity is the same in both themes); only `accent-fg` (text/icon
        // ON an accent-tinted-but-not-solid surface) and `accent-soft`
        // (a faint accent-tinted fill) flip per theme for legibility.
        accent: {
          DEFAULT: withAlpha('--accent'),
          50: '#eef0ff',
          100: '#dfe1ff',
          200: '#c3c7ff',
          300: '#9da3fb',
          400: '#7b82f4',
          500: '#4d57e8',
          600: '#3d45cc',
          700: '#3138a3',
          800: '#2a3082',
          900: '#252a68',
          fg: withAlpha('--accent-fg'),
          soft: withAlpha('--accent-soft'),
        },

        // ── Semantic status ───────────────────────────────────────────────
        // Each: solid (the color), -soft (faint tinted fill for the current
        // theme), -fg (readable text/icon over -soft in the current theme).
        success: {
          DEFAULT: withAlpha('--success'),
          soft: withAlpha('--success-soft'),
          fg: withAlpha('--success-fg'),
        },
        warning: {
          DEFAULT: withAlpha('--warning'),
          soft: withAlpha('--warning-soft'),
          fg: withAlpha('--warning-fg'),
        },
        danger: {
          DEFAULT: withAlpha('--danger'),
          soft: withAlpha('--danger-soft'),
          fg: withAlpha('--danger-fg'),
        },
        info: {
          DEFAULT: withAlpha('--info'),
          soft: withAlpha('--info-soft'),
          fg: withAlpha('--info-fg'),
        },
      },

      boxShadow: {
        // Shadows ARE the elevation cue in the light theme (you can't lift a
        // surface by lightening it). Driven by variables so the dark theme
        // can use near-invisible shadows and rely on surface contrast.
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
        glow: 'var(--shadow-glow)',
      },

      backgroundImage: {
        // Faint dotted grid — tints itself per theme.
        'grid-faint':
          'radial-gradient(circle at 1px 1px, rgb(var(--tint-base) / 0.05) 1px, transparent 0)',
      },

      keyframes: {
        fadeIn: {
          // Opacity-only — a translate here inflates scrollHeight on mount
          // (see Phase 1.5). Keep it pure.
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        flipIn: {
          '0%': { opacity: '0', transform: 'rotateX(-12deg)' },
          '100%': { opacity: '1', transform: 'rotateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'flip-in': 'flipIn 0.4s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
