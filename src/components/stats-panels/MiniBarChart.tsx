import { useState } from 'react';

export interface MiniBarPoint {
  /** Unique key for React (the day-string, usually). */
  key: string;
  /** Tick label below the bar — kept short. May be empty for crowded series. */
  label: string;
  /** The number that drives bar height. */
  value: number;
  /** Optional richer tooltip; falls back to `${value}`. */
  hint?: string;
}

interface Props {
  data: MiniBarPoint[];
  /** Total chart height in px. */
  height?: number;
  /** Text shown centered when `data` is empty or all-zero. */
  emptyHint?: string;
}

/**
 * Compact bar chart for floating panels — fills `currentColor` (parent's
 * text color), so wrapping it in `text-accent` paints it accent in both
 * themes. No external lib; tiny SVG inline.
 *
 * Auto-thins tick labels: with > 14 bars we only show every Nth label so
 * the X axis doesn't smear into illegibility.
 */
export function MiniBarChart({ data, height = 140, emptyHint }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const max = Math.max(1, ...data.map(d => d.value));
  const empty = data.length === 0 || max === 0;

  // Decide tick stride so at most ~7 labels are visible.
  const stride = Math.max(1, Math.ceil(data.length / 7));

  if (empty) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-divider bg-surface-2 text-xs text-faint"
        style={{ height }}
      >
        {emptyHint ?? 'Sem dados no período.'}
      </div>
    );
  }

  // Sizing: SVG uses a fixed 800-wide viewBox + `preserveAspectRatio=none`
  // would distort text, so we let it auto-scale with default settings. The
  // bars themselves are computed based on data.length.
  const W = 800;
  const H = height;
  const padX = 10;
  const padTop = 8;
  const padBottom = 18; // room for labels
  const usableW = W - 2 * padX;
  const usableH = H - padTop - padBottom;
  const slot = usableW / data.length;
  const barW = Math.max(2, slot * 0.7);

  return (
    <div className="text-accent">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        {/* Baseline */}
        <line
          x1={padX}
          x2={W - padX}
          y1={H - padBottom}
          y2={H - padBottom}
          className="stroke-divider"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const x = padX + slot * i + (slot - barW) / 2;
          const h = (d.value / max) * usableH;
          const y = H - padBottom - h;
          const cx = padX + slot * i + slot / 2;
          const showLabel = i % stride === 0 || i === data.length - 1;
          const isHover = hoverIdx === i;
          return (
            <g key={d.key}>
              {/* Invisible wider hit target for hover */}
              <rect
                x={padX + slot * i}
                y={padTop}
                width={slot}
                height={H - padTop - padBottom}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={2}
                fill="currentColor"
                opacity={isHover ? 1 : d.value === 0 ? 0.18 : 0.85}
              />
              {showLabel && (
                <text
                  x={cx}
                  y={H - padBottom + 11}
                  textAnchor="middle"
                  fontSize={9}
                  className="fill-faint"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {shortenLabel(d.label)}
                </text>
              )}
              {isHover && (
                <text
                  x={cx}
                  y={Math.max(padTop + 9, y - 4)}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-primary"
                  fontFamily="Inter, system-ui, sans-serif"
                  fontWeight={600}
                >
                  {d.hint ?? d.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Trim a YYYY-MM-DD label down to DD/MM. Anything that doesn't look like a
 * date is passed through. Keeping the slash form (not "31 jul") because the
 * X axis is wide and crowded — short is better.
 */
function shortenLabel(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split('-');
    return `${d}/${m}`;
  }
  return s;
}
