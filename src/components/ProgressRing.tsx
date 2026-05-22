interface Props {
  ratio: number; // 0..1
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}

export function ProgressRing({
  ratio,
  size = 96,
  stroke = 8,
  label,
  sub,
}: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Trail — theme-aware via --tint-base (the same variable that drives
            .tint-1/2/3). Dark mode = white veil, light mode = blue-black veil. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(var(--tint-base) / 0.10)"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress — built from the accent CSS var so it stays on brand and
            picks up the theme-tuned accent value automatically. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(var(--accent))"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && <div className="text-base font-semibold text-primary">{label}</div>}
        {sub && (
          <div className="text-[10px] uppercase tracking-widest text-muted">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
