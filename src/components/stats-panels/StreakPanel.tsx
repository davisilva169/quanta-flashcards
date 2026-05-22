import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { FloatingPanel } from '../FloatingPanel';
import { PanelFilters } from './PanelFilters';
import type { ReviewLog } from '@/types/review';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import {
  filterLogs,
  dailySeries,
  heatmapCells,
  activityFacts,
  streakFromSeries,
  PERIOD_LABELS,
  type StatsScope,
  type StatsPeriod,
  type HeatmapCell,
} from '@/utils/statsAnalysis';
import { formatDate } from '@/utils/dates';

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
  /** The global streak from userStats — shown alongside the filtered one. */
  globalStreak: number;
  globalLongest: number;
}

export function StreakPanel({
  open,
  onClose,
  logs,
  decks,
  folders,
  scope,
  period,
  onScopeChange,
  onPeriodChange,
  globalStreak,
  globalLongest,
}: Props) {
  const filteredLogs = useMemo(
    () => filterLogs(logs, decks, scope, period),
    [logs, decks, scope, period],
  );
  const series = useMemo(
    () => dailySeries(filteredLogs, period),
    [filteredLogs, period],
  );
  const cells = useMemo(() => heatmapCells(series), [series]);
  const facts = useMemo(() => activityFacts(series), [series]);
  const filteredStreak = useMemo(() => streakFromSeries(series), [series]);

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title="Sequência e atividade"
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

      {/* Global streak (always-on) + filtered streak (changes with scope) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Tile
          icon={<Flame size={14} />}
          label="Sequência global atual"
          value={`${globalStreak} dia${globalStreak === 1 ? '' : 's'}`}
          hint={`recorde: ${globalLongest}`}
          tone="accent"
        />
        <Tile
          label="No filtro selecionado"
          value={`${filteredStreak.current} / ${filteredStreak.best}`}
          hint="atual / melhor neste recorte"
        />
      </div>

      {/* Heatmap */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Heatmap
          </div>
          <HeatmapLegend />
        </div>
        <Heatmap cells={cells} />
      </div>

      {/* Activity summary */}
      <div className="grid grid-cols-3 gap-3">
        <Tile
          label="Dias ativos"
          value={`${facts.activeDays}`}
          hint={`de ${facts.totalDays}`}
        />
        <Tile
          label="Maior intervalo"
          value={`${facts.longestGap} dia${facts.longestGap === 1 ? '' : 's'}`}
          hint="sem revisar"
        />
        <Tile
          label="Total revisões"
          value={`${filteredLogs.length}`}
          hint="no período"
        />
      </div>
    </FloatingPanel>
  );
}

// ── Heatmap (SVG inline) ─────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * GitHub-style activity grid. Cells are colored by count via discrete tiers
 * (0 → faint surface; 1-2 → light accent; 3-5 → mid; 6+ → bold) so days with
 * a handful of reviews still register. Tier thresholds use the running max
 * to scale per-recortes — a quiet "by deck" view still looks meaningful.
 */
function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-divider bg-surface-2 text-xs text-faint py-10">
        Sem atividade no período.
      </div>
    );
  }

  const maxCount = Math.max(...cells.map(c => c.count));
  const totalCols = (cells[cells.length - 1].weekIndex ?? 0) + 1;

  const CELL = 12;
  const GAP = 3;
  const LEFT_LABEL_W = 18;
  const TOP_LABEL_H = 14;
  const W = LEFT_LABEL_W + totalCols * (CELL + GAP);
  const H = TOP_LABEL_H + 7 * (CELL + GAP);

  // Tier-based opacity. With a low max (say 3), even a single review reads
  // strongly; with a high max (say 50), only big days look saturated.
  function tierOpacity(c: number) {
    if (c === 0) return 0.06;
    const t = c / maxCount;
    if (t < 0.25) return 0.25;
    if (t < 0.5) return 0.5;
    if (t < 0.75) return 0.75;
    return 1;
  }

  // Render. `text-accent` colors `currentColor` for the cells.
  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="text-accent"
      >
        {/* Weekday row labels — only show alternate ones to declutter. */}
        {WEEKDAY_LABELS.map((d, i) =>
          i % 2 === 1 ? (
            <text
              key={i}
              x={2}
              y={TOP_LABEL_H + i * (CELL + GAP) + CELL - 2}
              fontSize={9}
              className="fill-faint"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {d}
            </text>
          ) : null,
        )}

        {cells.map(c => {
          const x = LEFT_LABEL_W + c.weekIndex * (CELL + GAP);
          const y = TOP_LABEL_H + c.weekday * (CELL + GAP);
          const isHover = hover === c;
          return (
            <rect
              key={c.day}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2}
              fill="currentColor"
              opacity={tierOpacity(c.count)}
              stroke={isHover ? 'currentColor' : 'transparent'}
              strokeWidth={isHover ? 1.5 : 0}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>

      {/* Hover tooltip — DOM (not SVG) so it can use tokens easily. */}
      {hover && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-subtle bg-card px-2.5 py-1 text-[11px] text-secondary">
          <span className="font-mono text-faint">{formatDate(hover.ts)}</span>
          <span className="text-primary font-semibold">
            {hover.count} revisõe{hover.count === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  );
}

function HeatmapLegend() {
  const tiers = [0.06, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-1 text-[10px] text-faint">
      <span>menos</span>
      <div className="flex items-center gap-0.5 text-accent">
        {tiers.map((op, i) => (
          <span
            key={i}
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: 'currentColor', opacity: op }}
          />
        ))}
      </div>
      <span>mais</span>
    </div>
  );
}

// ── Local tile ──────────────────────────────────────────────────────────────

function Tile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'accent';
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'accent'
          ? 'border-accent/30 bg-accent-soft'
          : 'border-subtle bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        {icon}
        {label}
      </div>
      <div className="text-base font-semibold tracking-tight text-primary mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}
