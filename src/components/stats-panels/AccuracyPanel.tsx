import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { FloatingPanel } from '../FloatingPanel';
import { PanelFilters } from './PanelFilters';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import {
  filterLogs,
  filterCards,
  accuracy,
  trueRetention,
  intervalDistribution,
  PERIOD_LABELS,
  type StatsScope,
  type StatsPeriod,
} from '@/utils/statsAnalysis';

interface Props {
  open: boolean;
  onClose: () => void;
  cards: Flashcard[];
  logs: ReviewLog[];
  decks: Deck[];
  folders: Folder[];
  scope: StatsScope;
  period: StatsPeriod;
  onScopeChange: (s: StatsScope) => void;
  onPeriodChange: (p: StatsPeriod) => void;
}

/**
 * "Taxa de acerto" detail panel.
 *
 * Two headline metrics side-by-side:
 *   - Accuracy (acertos / total) — the raw measure.
 *   - True retention — same idea but counted ONLY on cards that had already
 *     graduated from initial learning. Anki users specifically watch this
 *     because the learning phase produces noisy "errei"s that aren't really
 *     about memory.
 *
 * Then the interval distribution — a histogram of CURRENT scheduled
 * intervals. A healthy schedule shows a long tail to the right; a stuck
 * schedule clusters near the left.
 */
export function AccuracyPanel({
  open,
  onClose,
  cards,
  logs,
  decks,
  folders,
  scope,
  period,
  onScopeChange,
  onPeriodChange,
}: Props) {
  const filteredLogs = useMemo(
    () => filterLogs(logs, decks, scope, period),
    [logs, decks, scope, period],
  );
  const filteredCards = useMemo(
    () => filterCards(cards, decks, scope),
    [cards, decks, scope],
  );

  const acc = useMemo(() => accuracy(filteredLogs), [filteredLogs]);
  const tr = useMemo(() => trueRetention(filteredLogs), [filteredLogs]);
  const buckets = useMemo(
    () => intervalDistribution(filteredCards),
    [filteredCards],
  );

  const maxBucket = Math.max(1, ...buckets.map(b => b.count));

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title="Taxa de acerto"
      subtitle={PERIOD_LABELS[String(period)]}
    >
      <PanelFilters
        decks={decks}
        folders={folders}
        scope={scope}
        period={period}
        onScopeChange={onScopeChange}
        onPeriodChange={onPeriodChange}
      />

      {/* Two headline numbers */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Big
          icon={<Target size={12} />}
          label="Acerto geral"
          value={filteredLogs.length === 0 ? '—' : `${Math.round(acc * 100)}%`}
          hint={`${filteredLogs.length} revisões`}
        />
        <Big
          label="Retenção verdadeira"
          value={tr === 0 ? '—' : `${Math.round(tr * 100)}%`}
          hint="Só cartões já graduados"
          accent
        />
      </div>

      {/* Distribution of CURRENT intervals */}
      <div className="mb-1">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Distribuição dos intervalos atuais
        </div>
        <div className="space-y-1.5">
          {buckets.map(b => {
            const pct = (b.count / maxBucket) * 100;
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="w-20 text-xs text-secondary">{b.label}</div>
                <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-10 text-right text-xs font-mono text-muted">
                  {b.count}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-faint">
          A "retenção verdadeira" desconta as primeiras repetições de cada
          cartão (estado <span className="font-mono">learning</span>), onde
          erros são esperados e não refletem memória de longo prazo.
        </div>
      </div>
    </FloatingPanel>
  );
}

function Big({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent
          ? 'border-accent/30 bg-accent-soft'
          : 'border-subtle bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-primary mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}
