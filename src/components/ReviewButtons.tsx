import { motion } from 'framer-motion';
import type { Rating } from '@/types/review';

interface Props {
  intervals: Record<Rating, string>;
  onRate: (r: Rating) => void;
  /** Highlight one of the buttons as suggested (e.g., from auto-grading). */
  suggested?: Rating | null;
}

/**
 * The four rating buttons. Each maps to a semantic status token:
 *   Errei   → danger    Difícil → warning
 *   Bom     → success   Fácil   → info
 *
 * Buttons use the `-soft` fill + `-fg` text + the solid color for the
 * border — all three flip per theme, so the buttons stay legible and
 * appropriately saturated in light and dark without hardcoded scales.
 */
const BUTTONS: {
  rating: Rating;
  label: string;
  hint: string;
  shortcut: string;
  /** Semantic token family. */
  tone: 'danger' | 'warning' | 'success' | 'info';
}[] = [
  { rating: 1, label: 'Errei', hint: 'Again', shortcut: '1', tone: 'danger' },
  { rating: 2, label: 'Difícil', hint: 'Hard', shortcut: '2', tone: 'warning' },
  { rating: 3, label: 'Bom', hint: 'Good', shortcut: '3', tone: 'success' },
  { rating: 4, label: 'Fácil', hint: 'Easy', shortcut: '4', tone: 'info' },
];

const TONE_CLASSES: Record<(typeof BUTTONS)[number]['tone'], string> = {
  danger:
    'bg-danger-soft border-danger/40 text-danger-fg hover:border-danger',
  warning:
    'bg-warning-soft border-warning/40 text-warning-fg hover:border-warning',
  success:
    'bg-success-soft border-success/40 text-success-fg hover:border-success',
  info: 'bg-info-soft border-info/40 text-info-fg hover:border-info',
};

export function ReviewButtons({ intervals, onRate, suggested }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 w-full max-w-3xl">
      {BUTTONS.map(b => {
        const isSuggested = suggested === b.rating;
        return (
          <motion.button
            key={b.rating}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onRate(b.rating)}
            className={`group relative px-4 py-4 rounded-xl border transition-all ${
              TONE_CLASSES[b.tone]
            } ${
              isSuggested
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-app'
                : ''
            }`}
          >
            {isSuggested && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-on-accent shadow">
                Sugerido
              </div>
            )}
            <div className="absolute top-2 right-2 text-[10px] font-mono opacity-50">
              {b.shortcut}
            </div>
            <div className="text-base font-medium">{b.label}</div>
            <div className="text-[11px] uppercase tracking-widest opacity-70">
              {b.hint}
            </div>
            <div className="mt-2 text-xs font-mono opacity-90">
              {intervals[b.rating]}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
