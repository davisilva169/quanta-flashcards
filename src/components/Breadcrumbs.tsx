import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Whether to show a home icon at the front. */
  showHome?: boolean;
  onHome?: () => void;
}

export function Breadcrumbs({
  items,
  showHome = true,
  onHome,
}: BreadcrumbsProps) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
      {showHome && (
        <>
          <button
            onClick={onHome}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-faint transition-colors hover:bg-card-hover hover:text-primary"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-faint" />
        </>
      )}
      {items.map((item, idx) => {
        const last = idx === items.length - 1;
        return (
          <span key={`${idx}-${item.label}`} className="flex items-center gap-1">
            {item.onClick && !last ? (
              <button
                onClick={item.onClick}
                className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-card-hover hover:text-primary"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`px-1.5 py-0.5 ${
                  last ? 'font-medium text-primary' : ''
                }`}
              >
                {item.label}
              </span>
            )}
            {!last && <ChevronRight className="h-3.5 w-3.5 text-faint" />}
          </span>
        );
      })}
    </nav>
  );
}
