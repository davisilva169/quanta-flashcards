import { useMemo } from 'react';

export interface StatsBarChartDatum {
  /** Day label, e.g. "Seg" or "06/05". */
  label: string;
  /** Total reviews on that day. */
  total: number;
  /** ISO date for tooltip. */
  iso?: string;
}

interface StatsBarChartProps {
  data: StatsBarChartDatum[];
}

/**
 * Last-7-days bar chart.
 *
 * Layout philosophy: keep ALL text outside the dynamic bar area, with
 * explicit pixel margins. Bars live in `innerWidth × innerHeight`; value
 * labels live in the top margin band; weekday labels live in the bottom
 * margin band. No `preserveAspectRatio="none"` — that flattens text into
 * the bar aspect ratio and is exactly the bug we hit before.
 *
 * The chart scales to the container via `width: 100%; height: auto` on the
 * SVG, with `viewBox` defining a fixed coordinate system so font sizes stay
 * proportional to the rendered image regardless of the parent's actual
 * pixel width.
 */
export function StatsBarChart({ data }: StatsBarChartProps) {
  const { maxValue, hasData, totalAll, daysWithReviews } = useMemo(() => {
    const max = Math.max(...data.map(d => d.total), 0);
    const total = data.reduce((acc, d) => acc + d.total, 0);
    const days = data.filter(d => d.total > 0).length;
    return {
      maxValue: max,
      hasData: total > 0,
      totalAll: total,
      daysWithReviews: days,
    };
  }, [data]);

  if (!hasData) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-surface-2 text-center">
        <div className="text-sm font-medium text-muted">
          Sem revisões nos últimos 7 dias
        </div>
        <div className="mt-1 text-xs text-faint">
          Faça uma revisão para ver o gráfico se animar.
        </div>
      </div>
    );
  }

  // Geometry — all explicit pixel values in viewBox space.
  const width = 760;
  const height = 220;
  const margin = { top: 32, right: 20, bottom: 36, left: 36 };
  const innerWidth = width - margin.left - margin.right; // 704
  const innerHeight = height - margin.top - margin.bottom; // 152

  // Headroom above the tallest bar so its number doesn't kiss the top edge.
  const chartMax = Math.max(1, Math.ceil(maxValue * 1.25));

  const cols = data.length;
  const groupWidth = innerWidth / cols;
  const barWidth = groupWidth * 0.55;
  const barOffset = (groupWidth - barWidth) / 2;

  // Y where the bar's bottom rests
  const baseY = margin.top + innerHeight;

  return (
    <div className="rounded-xl border border-subtle bg-card shadow-soft p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full text-accent"
        style={{ aspectRatio: `${width} / ${height}` }}
        // Default preserveAspectRatio="xMidYMid meet" preserves the aspect
        // ratio. Critical: don't override with "none" or text gets stretched.
      >
        {/* Bars fill with `currentColor` (the accent token, set via
            `text-accent` on the <svg>) so they theme automatically — no
            hardcoded blue stops that ignore the active theme. */}

        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map(t => {
          const y = margin.top + innerHeight * (1 - t);
          return (
            <line
              key={t}
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              className="stroke-subtle"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Baseline */}
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={baseY}
          y2={baseY}
          className="stroke-divider"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const x = margin.left + i * groupWidth + barOffset;
          const cx = margin.left + i * groupWidth + groupWidth / 2;
          const xLabelY = height - margin.bottom + 22;

          if (d.total === 0) {
            return (
              <g key={i}>
                <title>{d.iso ?? d.label}: nenhuma revisão</title>
                {/* Faint placeholder so empty days still register visually */}
                <rect
                  x={x}
                  y={baseY - 3}
                  width={barWidth}
                  height={3}
                  className="fill-subtle"
                  rx={1.5}
                />
                <text
                  x={cx}
                  y={xLabelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={13}
                  className="fill-faint"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {d.label}
                </text>
              </g>
            );
          }

          const barHeight = (d.total / chartMax) * innerHeight;
          const barY = baseY - barHeight;
          // Number label sits 8px above the bar, but never escapes the top
          // margin (which would clip against the SVG edge).
          const valueY = Math.max(barY - 8, margin.top - 8);

          return (
            <g key={i}>
              <title>
                {d.iso ?? d.label}: {d.total} revisão
                {d.total === 1 ? '' : 'ões'}
              </title>
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill="currentColor"
                rx={4}
              />
              <text
                x={cx}
                y={valueY}
                textAnchor="middle"
                dominantBaseline="alphabetic"
                fontSize={13}
                fontWeight={600}
                className="fill-primary"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {d.total}
              </text>
              <text
                x={cx}
                y={xLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={13}
                className="fill-muted"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          {totalAll} revisões em {daysWithReviews} dia
          {daysWithReviews === 1 ? '' : 's'} dos últimos 7
        </span>
        <span className="text-faint">
          {daysWithReviews === 7
            ? 'Constância completa.'
            : daysWithReviews >= 5
            ? 'Boa cadência.'
            : daysWithReviews >= 3
            ? 'Construindo o hábito.'
            : 'Cada dia conta.'}
        </span>
      </div>
    </div>
  );
}
