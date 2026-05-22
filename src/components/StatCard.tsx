import type { MouseEvent, ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /**
   * When true, renders the card with a faint accent-tinted fill instead of
   * the neutral surface. Reserved for cases where a single card needs to
   * stand out from a peer group (a "headline" metric).
   */
  accent?: boolean;
  /**
   * Optional click handler. When set, the card becomes a real button (keyboard
   * accessible, cursor pointer). When omitted, it's just a display tile.
   */
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}

/**
 * Compact metric tile. SOLID surfaces — no gradient that collapses to a flat
 * white-on-white in the light theme.
 *
 * Hover lift: the border deepens and the shadow grows, signalling
 * interactivity. With `onClick`, this also serves as the affordance for the
 * Stats page's drill-down panels.
 */
export function StatCard({ label, value, hint, icon, accent, onClick }: Props) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!(e as unknown as MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={`rounded-xl border p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card ${
        interactive ? 'cursor-pointer' : ''
      } ${
        accent
          ? 'bg-accent-soft border-accent/30 hover:border-accent/50'
          : 'bg-card border-subtle hover:border-divider'
      }`}
    >
      <div className="flex items-center gap-2 text-muted text-[10px] uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-primary">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
