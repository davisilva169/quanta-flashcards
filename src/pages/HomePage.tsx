import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Flame,
  Sparkles,
  Play,
  Target,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { db } from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Settings, UserStats } from '@/types/stats';
import { decayedStreak } from '@/utils/streak';
import { progressToNextLevel } from '@/utils/xp';
import { nextRank } from '@/utils/ranks';
import { reviewsTodayCount } from '@/utils/stats';
import { todaysMessage } from '@/utils/motivational';
import { ProgressRing } from '@/components/ProgressRing';
import { StatCard } from '@/components/StatCard';
import { MotivationalMessage } from '@/components/MotivationalMessage';
import { DeckCard } from '@/components/DeckCard';
import type { Route } from '@/components/Sidebar';
import { deckProgress } from '@/utils/stats';
import { now } from '@/utils/dates';

interface Props {
  onNavigate: (r: Route) => void;
}

export function HomePage({ onNavigate }: Props) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    (async () => {
      const [d, c, l, s, st] = await Promise.all([
        db.decks.toArray(),
        db.cards.toArray(),
        db.reviewLogs.toArray(),
        db.userStats.get('singleton'),
        db.settings.get('singleton'),
      ]);
      setDecks(d);
      setCards(c);
      setLogs(l);

      // Apply streak decay on app open — the streak should reflect actual
      // study habits even if the user just opened the app.
      if (s) {
        const fixed = decayedStreak(s);
        if (fixed.streakDays !== s.streakDays) {
          await db.userStats.put(fixed);
          setStats(fixed);
        } else {
          setStats(s);
        }
      }
      setSettings(st || null);
    })();
  }, []);

  const dueToday = useMemo(
    () => cards.filter(c => c.due <= now() && c.reps > 0).length,
    [cards],
  );
  const newCount = useMemo(
    () => cards.filter(c => c.reps === 0).length,
    [cards],
  );
  const reviewsToday = useMemo(() => reviewsTodayCount(logs), [logs]);

  const recentDecks = useMemo(
    () => [...decks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [decks],
  );

  if (!stats || !settings) return null;

  const lvl = progressToNextLevel(stats.xp);
  const next = nextRank(lvl.level);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Olá,</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {settings.userName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate({ name: 'rush-setup' })}
            className="group flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-on-accent shadow-glow transition-all"
            title="Sessão cronometrada com cartões interativos"
          >
            <Zap size={16} />
            <span className="font-medium">Modo Rush</span>
          </button>
          <button
            onClick={() => onNavigate({ name: 'focus-setup' })}
            disabled={dueToday + newCount === 0}
            className="group flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 hover:from-accent-400 hover:to-accent-600 text-on-accent shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Configure a sessão e revise no seu ritmo"
          >
            <Play size={16} />
            <span className="font-medium">Revisar agora</span>
            <span className="ml-2 px-2 py-0.5 text-xs rounded-md on-accent-tint-2">
              {dueToday + newCount}
            </span>
          </button>
        </div>
      </header>

      {settings.motivationalEnabled && (
        <MotivationalMessage message={todaysMessage()} />
      )}

      {/* Rank + level card. The visual centerpiece of the home page now. */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-card to-surface"
        >
          <div className={`flex items-center gap-4 bg-gradient-to-r ${lvl.rank.gradient} px-5 py-3 text-on-accent`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg tint-3 backdrop-blur-sm">
              <span className="text-base font-bold">{lvl.level}</span>
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-on-accent/70">
                Posto
              </div>
              <div className="text-base font-semibold">{lvl.rank.title}</div>
            </div>
            <div className="text-right text-[11px] text-on-accent/70 italic">
              {lvl.rank.flavor}
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                Nível {lvl.level} • {stats.xp.toLocaleString('pt-BR')} XP
              </span>
              <span>
                {lvl.current.toLocaleString('pt-BR')} / {lvl.needed.toLocaleString('pt-BR')} para nível {lvl.level + 1}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full tint-2">
              <motion.div
                className={`h-full bg-gradient-to-r ${lvl.rank.gradient}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, lvl.ratio * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            {next && (
              <div className="flex items-center gap-2 pt-1 text-xs text-faint">
                <span>Próximo posto:</span>
                <span className={`font-medium ${next.text}`}>{next.title}</span>
                <ArrowRight size={11} />
                <span className="text-faint">a partir do nível {next.minLevel}</span>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Target size={12} className="text-warning" />}
          label="Vencidos hoje"
          value={dueToday}
          accent={dueToday > 0}
          hint={`${reviewsToday} já revisados`}
        />
        <StatCard
          icon={<Sparkles size={12} className="text-accent" />}
          label="Cartões novos"
          value={newCount}
        />
        <StatCard
          // Flame só aparece quando há sequência ativa. Quando ela quebra
          // (streakDays = 0), o ícone some — o "fogo apaga".
          icon={
            stats.streakDays >= 1 ? (
              <Flame size={12} className="text-warning" />
            ) : undefined
          }
          label="Sequência"
          value={`${stats.streakDays}d`}
          hint={`Maior: ${stats.longestStreak}d`}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Progresso de hoje
          </h2>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-subtle bg-gradient-to-br from-card to-surface p-6 flex items-center gap-6"
        >
          <ProgressRing
            ratio={Math.min(1, reviewsToday / settings.dailyGoal)}
            label={`${reviewsToday}`}
            sub={`/ ${settings.dailyGoal}`}
            size={104}
          />
          <div className="flex-1">
            <div className="text-lg font-medium">
              {reviewsToday >= settings.dailyGoal
                ? 'Meta atingida.'
                : 'Continue no ritmo.'}
            </div>
            <p className="text-sm text-muted mt-1">
              {reviewsToday >= settings.dailyGoal
                ? 'Você completou suas revisões de hoje. Cada cartão extra é bônus.'
                : `Faltam ${
                    settings.dailyGoal - reviewsToday
                  } revisões para a meta diária.`}
            </p>
          </div>
        </motion.div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Baralhos recentes
          </h2>
          <button
            onClick={() => onNavigate({ name: 'decks' })}
            className="text-sm text-accent-fg hover:text-accent-fg/80"
          >
            Ver todos
          </button>
        </div>

        {recentDecks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-divider p-8 text-center text-muted text-sm">
            Nenhum baralho ainda.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDecks.map(deck => {
              const deckCards = cards.filter(c => c.deckId === deck.id);
              const deckLogs = logs.filter(l => l.deckId === deck.id);
              return (
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  progress={deckProgress(deckCards, deckLogs)}
                  onOpen={() => onNavigate({ name: 'deck', deckId: deck.id })}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
