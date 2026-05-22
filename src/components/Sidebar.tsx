import {
  Home,
  Layers,
  BarChart3,
  Settings as SettingsIcon,
  Sparkles,
  Crown,
  Flame as FlameIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { FocusGoal, FocusScope } from '@/types/focus';

export type Route =
  | { name: 'home' }
  | { name: 'decks' }
  | { name: 'deck'; deckId: string }
  | { name: 'create-deck'; folderId?: string | null }
  | { name: 'folder'; folderId: string }
  | { name: 'create-folder' }
  | { name: 'create-card'; deckId: string }
  | { name: 'edit-card'; cardId: string }
  | { name: 'review'; deckId?: string }
  | { name: 'rush-setup' }
  | {
      name: 'rush-session';
      /** Deck filter; null = pull from all decks. */
      deckId: string | null;
      /** Total session duration in seconds; null = unlimited (until queue empties). */
      durationSec: number | null;
    }
  | { name: 'stats' }
  | { name: 'titles' }
  | { name: 'flame' }
  | { name: 'focus-setup' }
  | {
      name: 'focus-session';
      focusSeconds: number;
      breakSeconds: number;
      scope: FocusScope;
      goal: FocusGoal;
    }
  | { name: 'focus-summary'; logId: string; breakSeconds: number }
  | { name: 'settings' };

interface Props {
  current: Route;
  onNavigate: (r: Route) => void;
}

const items: { key: Route['name']; label: string; icon: any }[] = [
  { key: 'home', label: 'Início', icon: Home },
  { key: 'decks', label: 'Baralhos', icon: Layers },
  { key: 'stats', label: 'Estatísticas', icon: BarChart3 },
  { key: 'titles', label: 'Títulos', icon: Crown },
  { key: 'flame', label: 'Chama', icon: FlameIcon },
  { key: 'settings', label: 'Configurações', icon: SettingsIcon },
];
// Note: rotas `focus-setup`, `focus-session` e `focus-summary` ainda existem
// no Route union (e o handler ainda destaca na sidebar se o usuário cair
// numa delas), mas o ponto de entrada agora é o botão "Revisar agora" na
// HomePage. Sessão de foco virou o jeito padrão de revisar, não uma
// alternativa de menu lateral.

// Routes that count as "inside the decks section" for sidebar highlighting.
const DECK_SECTION_ROUTES: Route['name'][] = [
  'deck',
  'create-deck',
  'folder',
  'create-folder',
  'create-card',
  'edit-card',
];

/**
 * Fixed left navigation.
 *
 * Surface is `bg-surface` (SOLID — no translucency). A translucent sidebar
 * over a near-white floor in light mode just dissolves; a solid surface +
 * a `border-divider` hairline reads cleanly in both themes. The active item
 * uses `bg-accent-soft` + `text-accent-fg` — a faint accent-tinted fill that
 * the token system flips per theme, plus the sliding accent rail.
 */
export function Sidebar({ current, onNavigate }: Props) {
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-surface border-r border-divider">
      {/* Brand */}
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-glow">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-primary">
            Quanta
          </div>
          <div className="text-[10px] uppercase tracking-widest text-faint">
            v0.2
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 flex flex-col gap-0.5 mt-2">
        {items.map(item => {
          const isActive =
            current.name === item.key ||
            (item.key === 'decks' &&
              DECK_SECTION_ROUTES.includes(current.name));
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate({ name: item.key } as Route)}
              className={`relative group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-accent-soft text-accent-fg font-medium'
                  : 'text-secondary hover:text-primary hover:tint-1'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={16} className="shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer blurb */}
      <div className="mt-auto p-4 text-[11px] text-faint leading-relaxed border-t border-subtle">
        Flashcards técnicos com LaTeX, repetição espaçada e progresso real.
      </div>
    </aside>
  );
}
