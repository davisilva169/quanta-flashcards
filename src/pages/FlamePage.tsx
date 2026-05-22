import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame as FlameIcon, Calendar, Trophy } from 'lucide-react';
import { db } from '@/db/database';
import type { ReviewLog } from '@/types/review';
import type { Settings, UserStats } from '@/types/stats';
import { reviewsTodayCount, reviewsByDay } from '@/utils/stats';
import { decayedStreak } from '@/utils/streak';
import { Flame, flameIntensityFor, flameLabel } from '@/components/Flame';

/**
 * FlamePage — visualização da constância diária.
 *
 * Filosofia:
 *   Não é gamificação. É um ritual visual. A chama acende quando você
 *   estuda hoje, cresce com o esforço, esfria com o tempo. Streak é só
 *   um número — a chama é a sensação.
 *
 * Dados consumidos:
 *   - `db.reviewLogs.toArray()` → filtrado pra contar hoje e últimos 14 dias.
 *   - `db.userStats.get('singleton')` → streak atual + maior streak.
 *     Aplicamos `decayedStreak` para refletir 0 quando o usuário pulou
 *     dias sem que o app tenha sido aberto — caso contrário o número
 *     "mente".
 *   - `db.settings.get('singleton')` → meta diária (`dailyGoal`).
 *
 * Apresentação:
 *   - Hero: chama central (componente Flame), rótulo do estado, mensagem
 *     motivacional rotativa (estável por dia, não pula a cada render).
 *   - 3 cards stats: revisões hoje, streak atual, maior streak.
 *   - Mini-heatmap 14 dias: uma barrinha por dia, altura proporcional à
 *     densidade. Tooltip nativo (title=).
 *   - Recompensa saudável: aparece SÓ quando a meta diária é atingida
 *     (>= 100%). Suavemente fade-in. Sugestão fixa por dia, não roleta
 *     a cada render.
 *
 * Observações sobre configurabilidade (per spec):
 *   A meta diária já é ajustável em Configurações (`dailyGoal`). Mensagens
 *   motivacionais e recompensas estão hard-coded nesta fase; expansão pra
 *   personalizáveis fica anotada no roadmap (Bloco D já tratará recompensas
 *   na Sessão de Foco, podemos compartilhar a estrutura no futuro).
 */
export function FlamePage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<ReviewLog[]>([]);

  useEffect(() => {
    void (async () => {
      const [s, settings, allLogs] = await Promise.all([
        db.userStats.get('singleton'),
        db.settings.get('singleton'),
        db.reviewLogs.toArray(),
      ]);
      // Apply streak decay defensively. The user might have closed the
      // app for days; `streakDays` on disk might still claim "5" but the
      // truth is the streak broke. `decayedStreak` returns the same
      // object if intact, or a fresh one with streakDays=0 if decayed.
      setStats(s ? decayedStreak(s) : null);
      setSettings(settings ?? null);
      setLogs(allLogs);
    })();
  }, []);

  const reviewsToday = useMemo(() => reviewsTodayCount(logs), [logs]);
  const dailyGoal = settings?.dailyGoal ?? 20;
  const intensity = flameIntensityFor(reviewsToday, dailyGoal);
  const reachedGoal = reviewsToday >= dailyGoal;

  // Reviews dos últimos 14 dias. Reusa o helper já usado pelo Stats.
  const last14 = useMemo(() => reviewsByDay(logs, 14), [logs]);
  const maxBucket = useMemo(
    () => Math.max(1, ...last14.map(b => b.total)),
    [last14],
  );

  // Mensagem motivacional estável por dia: índice via dia-do-ano. Não
  // rotacionando a cada render — a sensação ficaria nervosa.
  const messageIdx = dayIndexFromToday();
  const message =
    intensity === 0
      ? MESSAGES_COLD[messageIdx % MESSAGES_COLD.length]
      : reachedGoal
      ? MESSAGES_FULL[messageIdx % MESSAGES_FULL.length]
      : MESSAGES_BURNING[messageIdx % MESSAGES_BURNING.length];

  if (!stats || !settings) {
    return (
      <div className="space-y-6 animate-fade-in">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Chama</h1>
          <p className="text-sm text-muted mt-1">Carregando…</p>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chama</h1>
        <p className="text-sm text-muted mt-1">
          Constância é o motor lento que vence a empolgação. A chama mede o
          dia de hoje — sem julgamento, sem urgência.
        </p>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-subtle bg-card p-6">
        <div className="flex flex-col items-center text-center">
          <Flame intensity={intensity} size={220} />

          <div className="mt-2 text-[11px] uppercase tracking-widest text-muted">
            {flameLabel(intensity)}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={message}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-3 max-w-md text-sm text-secondary leading-relaxed italic"
            >
              {message}
            </motion.div>
          </AnimatePresence>

          {/* Progress bar até a meta. Fica visível mesmo apagada (linha
              cinza), pra explicar o caminho. */}
          <div className="mt-5 w-full max-w-md">
            <div className="flex justify-between text-[10px] text-faint uppercase tracking-widest mb-1">
              <span>Hoje</span>
              <span>
                {reviewsToday}/{dailyGoal}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  reachedGoal
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-gradient-to-r from-amber-400 to-orange-400'
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, (reviewsToday / dailyGoal) * 100)}%`,
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Recompensa quando a meta é batida ──────────────────────────── */}
      {reachedGoal && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-xl border border-success/30 bg-success-soft p-4"
        >
          <div className="text-[10px] uppercase tracking-widest text-success-fg/80 mb-1">
            Meta concluída
          </div>
          <div className="text-sm text-success-fg leading-relaxed">
            <strong>Sugestão saudável:</strong>{' '}
            {REWARDS[messageIdx % REWARDS.length]}
          </div>
        </motion.section>
      )}

      {/* ── 3 cards stats ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<FlameIcon size={14} />}
          label="Revisões hoje"
          value={reviewsToday.toString()}
          hint={`${Math.round((reviewsToday / dailyGoal) * 100)}% da meta`}
        />
        <StatCard
          icon={<Calendar size={14} />}
          label="Sequência atual"
          value={`${stats.streakDays} ${stats.streakDays === 1 ? 'dia' : 'dias'}`}
          hint={stats.streakDays === 0 ? 'Comece hoje' : undefined}
        />
        <StatCard
          icon={<Trophy size={14} />}
          label="Maior sequência"
          value={`${stats.longestStreak} ${stats.longestStreak === 1 ? 'dia' : 'dias'}`}
        />
      </section>

      {/* ── Heatmap 14 dias ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-secondary uppercase tracking-widest">
            Últimos 14 dias
          </h2>
          <div className="text-[11px] text-faint">
            {last14.reduce((sum, b) => sum + b.total, 0)} revisões
          </div>
        </div>
        <div className="rounded-xl border border-subtle bg-card p-4">
          <div className="flex items-end justify-between gap-1 h-24">
            {last14.map(bucket => {
              const ratio = bucket.total / maxBucket;
              // Min height pra que dia com 0 ainda apareça como uma
              // linha tênue (em vez de sumir).
              const height = bucket.total === 0 ? 2 : Math.max(4, ratio * 90);
              return (
                <div
                  key={bucket.date}
                  className="group relative flex-1 flex flex-col justify-end"
                  title={`${bucket.date}: ${bucket.total} revisões`}
                >
                  <div
                    className={`w-full rounded-sm transition-colors ${
                      bucket.total === 0
                        ? 'bg-surface-2'
                        : ratio >= 1
                        ? 'bg-amber-500'
                        : ratio >= 0.66
                        ? 'bg-amber-400'
                        : ratio >= 0.33
                        ? 'bg-amber-300'
                        : 'bg-amber-200'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-faint">
            <span>{last14[0]?.date.slice(5)}</span>
            <span>{last14[last14.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-primary">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────
// Three pools, picked deterministically by day-of-year so the message
// stays stable while you're on the page (and across navigations within
// the same day). The tone aims at sobriety — no exclamation marks, no
// emojis, no fake enthusiasm. A study app's UI is intimate and the user
// is usually tired. Calm beats loud.

const MESSAGES_COLD = [
  'Hoje ainda é cedo. Um cartão já basta para começar.',
  'Toda chama começa fria. Você só precisa do primeiro gesto.',
  'A constância não exige inspiração. Só presença.',
  'O dia não foi gasto. Há tempo para algumas revisões.',
  'Comece pequeno. A continuidade faz o resto.',
];

const MESSAGES_BURNING = [
  'A brasa está acesa. Mantenha o ritmo.',
  'Cada revisão é uma camada de fundação.',
  'Você está no fluxo. Não interrompa antes da hora.',
  'O esforço de hoje fica gravado mesmo se você não notar agora.',
  'Constância silenciosa é o que constrói intuição.',
];

const MESSAGES_FULL = [
  'A meta foi cumprida. Você pode descansar com consciência.',
  'O dia foi honesto. Agora levante e respire.',
  'A chama está cheia. O ritmo de hoje é o seu padrão amanhã.',
  'Você fez o que precisava. O resto é bônus.',
  'Constância é o que você acabou de praticar.',
];

const REWARDS = [
  'beba um copo d\'água.',
  'levante e alongue por um minuto.',
  'olhe pela janela e foque em algo a 6 metros de distância.',
  'caminhe cinco minutos longe da tela.',
  'respire fundo dez vezes, contando.',
  'organize um pequeno canto da sua mesa.',
  'prepare um café ou chá — e tome sem tela.',
  'explique em voz alta um conceito que você revisou.',
  'escreva uma fórmula bonita à mão numa folha solta.',
  'mande uma mensagem para alguém contando algo que aprendeu.',
];

/** Day-of-year-ish index, stable across the same calendar day. */
function dayIndexFromToday(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
