import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { FloatingPanel } from '../FloatingPanel';
import { PanelFilters } from './PanelFilters';
import { MiniBarChart } from './MiniBarChart';
import type { ReviewLog } from '@/types/review';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import {
  filterLogs,
  dailySeries,
  timeFacts,
  formatDuration,
  PERIOD_LABELS,
  type StatsScope,
  type StatsPeriod,
} from '@/utils/statsAnalysis';

interface Props {
  open: boolean;
  onClose: () => void;
  logs: ReviewLog[];
  decks: Deck[];
  folders: Folder[];
  scope: StatsScope;
  period: StatsPeriod;
  onScopeChange: (s: StatsScope) => void;
  onPeriodChange: (p: StatsPeriod) => void;
}

/**
 * "Tempo de estudo" detail panel.
 *
 * The bar chart shows total time PER DAY (in minutes); supporting tiles
 * show the totals/averages. The most-used reading here is "where did my
 * time actually go?" — hence the daily breakdown gets the most real
 * estate.
 */
export function StudyTimePanel({
  open,
  onClose,
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
  const series = useMemo(
    () => dailySeries(filteredLogs, period),
    [filteredLogs, period],
  );
  const facts = useMemo(
    () => timeFacts(series, filteredLogs),
    [series, filteredLogs],
  );

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title="Tempo de estudo"
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
        <div className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1.5">
          <Clock size={11} />
          Total no período
        </div>
        <div className="text-3xl font-semibold tracking-tight text-primary">
          {formatDuration(facts.totalMs)}
        </div>
      </div>

      {/* Daily chart in minutes */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Tempo por dia
        </div>
        <MiniBarChart
          data={series.map(p => ({
            key: p.day,
            label: p.day,
            value: Math.round(p.totalMs / 60_000),
            hint: formatDuration(p.totalMs),
          }))}
          height={160}
          emptyHint="Sem tempo registrado no período."
        />
        <div className="text-[10px] text-faint mt-1">Eixo Y: minutos</div>
      </div>

      {/* Sub-stats */}
      <div className="grid grid-cols-3 gap-3">
        <Tile
          label="Média por dia ativo"
          value={formatDuration(facts.meanPerActiveDayMs)}
        />
        <Tile
          label="Maior dia"
          value={formatDuration(facts.longestDayMs)}
        />
        <Tile
          label="Média por cartão"
          value={formatDuration(facts.meanPerSessionMs)}
        />
      </div>
    </FloatingPanel>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-subtle bg-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className="text-base font-semibold tracking-tight text-primary mt-1">
        {value}
      </div>
    </div>
  );
}
