import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8 rounded-xl border border-dashed border-divider">
      {icon && (
        <div className="w-12 h-12 rounded-full tint-1 flex items-center justify-center text-muted mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium tracking-tight text-primary">{title}</h3>
      {description && (
        <p className="text-sm text-muted mt-1 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
