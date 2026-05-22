import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  Brain, BookOpen, Coffee, Compass, Droplet, Eye, Footprints, Glasses,
  Map as MapIcon, Music, PenLine, RefreshCw, Sparkles, Sun, Trees, Wind,
  X,
} from 'lucide-react';
import { pickReward, type Reward, type RewardKind } from '@/utils/rewards';
import type { Rank } from '@/utils/ranks';
import { Portal } from './Portal';

const ICON_MAP = {
  Droplet, Footprints, Eye, Coffee, Sparkles, Sun, Wind, BookOpen,
  Music, PenLine, Brain, Glasses, Map: MapIcon, Compass, Trees,
} as const;

interface RewardModalProps {
  open: boolean;
  kind: RewardKind;
  onClose: () => void;
  /**
   * Pre-picked reward — useful for deterministic display when the parent
   * already chose one. If omitted, modal picks its own.
   */
  initialReward?: Reward;
  /** For level-up rewards: pass the rank to color the modal header. */
  rank?: Rank;
  /** Optional title override. */
  headline?: string;
  /** Optional sub-headline shown below the headline. */
  subline?: string;
}

/**
 * Reward modal. The overlay is intentionally `bg-black/70` in BOTH themes —
 * a dark scrim is the correct treatment for a modal backdrop regardless of
 * theme (it focuses attention and dims the page). The panel itself is the
 * solid `bg-elevated` token, so it's light in the light theme.
 *
 * The header keeps a colored gradient (accent or rank) — that's brand color,
 * intentional, and white text on it works in both themes. The highlight veil
 * on the close button uses `on-accent-tint-*` (always-white) because it sits
 * on the colored header, not on a theme-neutral surface.
 */
export function RewardModal({
  open,
  kind,
  onClose,
  initialReward,
  rank,
  headline,
  subline,
}: RewardModalProps) {
  const [reward, setReward] = useState<Reward>(
    () => initialReward ?? pickReward(kind),
  );

  const Icon = ICON_MAP[reward.icon];
  const headlineText =
    headline ??
    (kind === 'daily' ? 'Meta diária concluída' : 'Você subiu de nível');

  function swap() {
    setReward(prev => pickReward(kind, { exclude: prev.id }));
  }

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-elevated shadow-elevated"
          >
            {/* Decorative gradient header — brand color, intentional. */}
            <div
              className={`relative h-24 bg-gradient-to-br ${
                kind === 'levelUp' && rank
                  ? rank.gradient
                  : 'from-accent-600 to-accent-400'
              }`}
            >
              <button
                onClick={onClose}
                className="absolute right-3 top-3 rounded-full on-accent-tint-1 p-1.5 text-on-accent/80 transition-colors hover:on-accent-tint-2 hover:text-on-accent"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute inset-x-0 bottom-3 px-5">
                <div className="text-[11px] uppercase tracking-widest text-white/70">
                  {kind === 'daily'
                    ? 'Recompensa diária'
                    : 'Recompensa de nível'}
                </div>
                <div className="text-lg font-semibold text-white">
                  {headlineText}
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {subline && <p className="text-sm text-secondary">{subline}</p>}

              <div className="flex gap-3 rounded-xl border border-subtle bg-card p-4">
                <div className="rounded-lg bg-accent-soft p-2.5 text-accent-fg">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-primary">
                    {reward.title}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {reward.description}
                  </p>
                  <div className="mt-2 text-[11px] uppercase tracking-wide text-faint">
                    Sugerido: {reward.durationLabel}
                  </div>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-faint">
                Recompensa opcional. Use se fizer sentido agora — sem pressão.
                A ideia é só lembrar que estudar bem inclui pausas saudáveis.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-accent py-2 font-medium text-on-accent hover:bg-accent-400"
                >
                  Concluído
                </button>
                <button
                  onClick={swap}
                  className="flex items-center gap-2 rounded-lg border border-divider px-3 py-2 text-sm text-secondary hover:border-strong hover:tint-1"
                  title="Trocar sugestão"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Trocar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
