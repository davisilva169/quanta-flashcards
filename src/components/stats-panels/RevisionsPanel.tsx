import { useMemo } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { PanelFilters } from './PanelFilters';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import {
  filterLogs,
  filterCards,
  breakdownByState,
  breakdownByRating,
  dailySeries,
  PERIOD_LABELS,
  type StatsScope,
  type StatsPeriod,
} from '@/utils/statsAnalysis';
import { MiniBarChart } from './MiniBarChart';

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
 * "Total de revisões" detail panel.
 *
 * Four sections, top to bottom:
 *   1. Big number — total reviews in the filtered window.
 *   2. By card state (matches the screenshot Davi sent): Novos / Aprendendo
 *      / Jovens / Maduros — derived from the CURRENT card state, scoped by
 *      the scope filter. Period doesn't apply (a card's "state" is now).
 *   3. By rating — Errei/Difícil/Bom/Fácil, each as a count + bar.
 *   4. Daily histogram — the chart that shows distribution in time.
 */
export function RevisionsPanel({
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

  const stateBreakdown = useMemo(
    () => breakdownByState(filteredCards),
    [filteredCards],
  );
  const ratingBreakdown = useMemo(
    () => breakdownByRating(filteredLogs),
    [filteredLogs],
  );
  const series = useMemo(
    () => dailySeries(filteredLogs, period),
    [filteredLogs, period],
  );

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title="Total de revisões"
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

      {/* Headline */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-widest text-muted">
          Total no período
        </div>
        <div className="text-3xl font-semibold tracking-tight text-primary">
          {filteredLogs.length}
        </div>
      </div>

      {/* Card states — matches the screenshot's "Por estado" */}
      <Section title="Contagem de cartas — por estado">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StateTile label="Novos" value={stateBreakdown.novo} />
          <StateTile label="Aprendendo" value={stateBreakdown.aprendendo} />
          <StateTile label="Jovens" value={stateBreakdown.jovem} />
          <StateTile label="Maduros" value={stateBreakdown.maduro} />
        </div>
      </Section>

      {/* Rating breakdown — what fraction of reviews got each grade */}
      <Section title="Distribuição por nota">
        <div className="space-y-1.5">
          <RatingRow
            label="Errei"
            value={ratingBreakdown.errei}
            total={ratingBreakdown.total}
            tone="danger"
          />
          <RatingRow
            label="Difícil"
            value={ratingBreakdown.dificil}
            total={ratingBreakdown.total}
            tone="warning"
          />
          <RatingRow
            label="Bom"
            value={ratingBreakdown.bom}
            total={ratingBreakdown.total}
            tone="success"
          />
          <RatingRow
            label="Fácil"
            value={ratingBreakdown.facil}
            total={ratingBreakdown.total}
            tone="info"
          />
        </div>
      </Section>

      {/* Daily histogram */}
      <Section title="Revisões por dia">
        <MiniBarChart
          data={series.map(p => ({ key: p.day, label: p.day, value: p.count }))}
          height={140}
          emptyHint="Sem revisões no período."
        />
      </Section>
    </FloatingPanel>
  );
}

// ── Subcomponents (file-local — only used here) ──────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function StateTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-subtle bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className="text-lg font-semibold tracking-tight text-primary">
        {value}
      </div>
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-info',
};
const TONE_TEXT: Record<string, string> = {
  danger: 'text-danger-fg',
  warning: 'text-warning-fg',
  success: 'text-success-fg',
  info: 'text-info-fg',
};

function RatingRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'danger' | 'warning' | 'success' | 'info';
}) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-16 text-xs font-medium ${TONE_TEXT[tone]}`}>
        {label}
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full ${TONE_BAR[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-12 text-right text-xs font-mono text-muted">
        {value}
      </div>
    </div>
  );
}
