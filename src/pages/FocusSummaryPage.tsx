import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Coffee,
  ArrowLeft,
} from 'lucide-react';
import { db } from '@/db/database';
import type { Route } from '@/components/Sidebar';
import type { Settings } from '@/types/stats';
import type { StudySessionLog } from '@/types/focus';
import {
  formatDurationLong,
  pickRewardForSession,
  resolveFocusSettings,
} from '@/utils/focus';

interface Props {
  logId: string;
  /** Tempo de pausa sugerido vindo da Route (não precisamos relert do DB). */
  breakSeconds: number;
  onNavigate: (r: Route) => void;
}

/**
 * FocusSummaryPage — exibe o resumo da sessão recém-encerrada.
 *
 * Lê o `StudySessionLog` recém-gravado pelo `FocusSessionPage` (id passado
 * via Route). Mostra:
 *
 *   - Duração efetiva (e se concluiu ou foi encerrada antes)
 *   - Revisões totais, acertos, erros, taxa de acerto
 *   - Sugestão de pausa
 *   - Sugestão de recompensa saudável (se o usuário não desativou)
 *   - Botões pra começar nova sessão ou voltar pra Home
 *
 * Não recalcula nada — só apresenta os agregados do log. Se um dia
 * quisermos detalhes (quais cartões, quais decks), cruzamos com
 * `reviewLogs.where('reviewedAt').between(startedAt, endedAt)`.
 */
export function FocusSummaryPage({ logId, breakSeconds, onNavigate }: Props) {
  const [log, setLog] = useState<StudySessionLog | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void (async () => {
      const [l, s] = await Promise.all([
        db.studySessionLogs.get(logId),
        db.settings.get('singleton'),
      ]);
      setLog(l ?? null);
      setSettings(s ?? null);
    })();
  }, [logId]);

  if (!log || !settings) {
    return (
      <div className="space-y-6 animate-fade-in">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Resumo da sessão
          </h1>
          <p className="text-sm text-muted mt-1">Carregando…</p>
        </header>
      </div>
    );
  }

  const accuracy =
    log.correct + log.wrong > 0
      ? log.correct / (log.correct + log.wrong)
      : null;

  // Recompensa: deterministic-by-seed (startedAt). Pool vem de Settings.
  // resolveFocusSettings preserva `undefined` vs `[]` — undefined cai pra
  // defaults só na primeira inicialização (via backfill no DB). Lista
  // vazia explícita significa "não quero sugestões".
  const focus = resolveFocusSettings(settings.focus);
  const reward =
    focus.showRewards && focus.rewards && focus.rewards.length > 0
      ? pickRewardForSession(focus.rewards, log.startedAt)
      : null;

  // Resolve o motivo do término. Logs gravados antes desse refinamento
  // não têm `endReason` — caímos no `completedByTimer` como fallback.
  // Quando ambos faltam, default conservador ("user").
  const endReason =
    log.endReason ?? (log.completedByTimer ? 'timer' : 'user');

  const title =
    endReason === 'timer'
      ? 'Sessão concluída'
      : endReason === 'goal'
      ? 'Meta atingida'
      : endReason === 'queue-empty'
      ? 'Você terminou tudo'
      : 'Sessão encerrada';

  const subtitle =
    endReason === 'timer'
      ? 'O tempo foi cumprido. Bom ritmo.'
      : endReason === 'goal'
      ? 'Você bateu a meta de revisões da sessão.'
      : endReason === 'queue-empty'
      ? 'Não há mais cartões vencidos no momento. Volte quando o intervalo de novos cartões chegar.'
      : 'Você encerrou antes do final. Tudo que foi revisado conta.';

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-1">{subtitle}</p>
      </header>

      {/* ── Card principal: duração ───────────────────────────────────── */}
      <section className="rounded-2xl border border-subtle bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent-soft p-3 text-accent-fg">
            <Clock size={20} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted">
              Tempo estudado
            </div>
            <div className="text-2xl font-semibold text-primary tabular-nums">
              {formatDurationLong(log.durationSeconds)}
            </div>
            {endReason === 'user' && (
              <div className="text-[11px] text-faint">
                de {formatDurationLong(log.configuredFocusSeconds)} configurados
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats grid ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox
          label="Revisões"
          value={log.reviews.toString()}
          tone="neutral"
        />
        <StatBox
          label="Acertos"
          value={log.correct.toString()}
          tone="success"
          icon={<CheckCircle2 size={14} />}
        />
        <StatBox
          label="Erros"
          value={log.wrong.toString()}
          tone="danger"
          icon={<XCircle size={14} />}
        />
        <StatBox
          label="Taxa de acerto"
          value={accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`}
          tone="neutral"
          hint={accuracy === null ? 'Nenhuma revisão' : undefined}
        />
      </section>

      {/* ── Pausa sugerida ────────────────────────────────────────────── */}
      {breakSeconds > 0 && (
        <section className="rounded-xl border border-subtle bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted mb-1">
            <Coffee size={12} />
            Pausa sugerida
          </div>
          <div className="text-sm text-secondary leading-relaxed">
            Tire <strong>{formatDurationLong(breakSeconds)}</strong> antes
            da próxima sessão. Levante, mexa o corpo, deixe a atenção
            relaxar.
          </div>
        </section>
      )}

      {/* ── Recompensa saudável ───────────────────────────────────────── */}
      {reward && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-success/30 bg-success-soft p-4"
        >
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="mt-0.5 text-success-fg shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-success-fg/80 mb-1">
                Sugestão
              </div>
              <div className="text-sm text-success-fg leading-relaxed">
                {reward}
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* ── Ações ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          onClick={() => onNavigate({ name: 'focus-setup' })}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-400"
        >
          Nova sessão
        </button>
        <button
          onClick={() => onNavigate({ name: 'home' })}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-divider bg-surface-2 px-4 py-2 text-sm text-primary hover:tint-1"
        >
          <ArrowLeft size={14} />
          Voltar ao início
        </button>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'danger';
  icon?: React.ReactNode;
  hint?: string;
}) {
  const toneStyle =
    tone === 'success'
      ? 'border-success/20 bg-success-soft'
      : tone === 'danger'
      ? 'border-danger/20 bg-danger-soft'
      : 'border-subtle bg-card';
  const labelTone =
    tone === 'success'
      ? 'text-success-fg/80'
      : tone === 'danger'
      ? 'text-danger-fg/80'
      : 'text-muted';
  const valueTone =
    tone === 'success'
      ? 'text-success-fg'
      : tone === 'danger'
      ? 'text-danger-fg'
      : 'text-primary';
  return (
    <div className={`rounded-xl border p-3 ${toneStyle}`}>
      <div
        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${labelTone}`}
      >
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-faint">{hint}</div>}
    </div>
  );
}
