import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface CollapsibleProps {
  title: string;
  /** Tiny text shown next to the title — typically a count ("5 itens"). */
  badge?: string;
  /** A short summary line shown below the title in collapsed state. */
  preview?: string;
  defaultOpen?: boolean;
  /**
   * When true, the card decorates itself with two faint layers peeking out
   * the bottom while collapsed, suggesting "more cards stacked under here".
   * Click expands; click again collapses.
   */
  stacked?: boolean;
  /**
   * Optional content rendered at the right of the header (small action
   * button etc.). Click events on this slot do NOT toggle the section.
   */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function Collapsible({
  title,
  badge,
  preview,
  defaultOpen = false,
  stacked = false,
  headerAction,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="relative">
      {/* Two faint layers peeking from the bottom when collapsed and
          stacked is on. Pure decoration; not interactive.
          They sit BEHIND the main card via negative z-index. */}
      {!open && stacked && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-3 -bottom-1.5 h-2.5 rounded-b-xl border-x border-b border-subtle bg-surface-2"
          />
          <div
            aria-hidden
            className="absolute inset-x-6 -bottom-3 h-2.5 rounded-b-xl border-x border-b border-subtle bg-surface"
          />
        </>
      )}

      <div className="relative rounded-xl border border-subtle bg-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(o => !o);
            }
          }}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:tint-1"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary">{title}</span>
              {badge && (
                <span className="rounded-md tint-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  {badge}
                </span>
              )}
            </div>
            {preview && !open && (
              <div className="mt-0.5 text-xs text-faint line-clamp-1">
                {preview}
              </div>
            )}
          </div>
          {headerAction && (
            <div onClick={e => e.stopPropagation()}>{headerAction}</div>
          )}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-muted"
          >
            <ChevronDown size={16} />
          </motion.span>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-subtle px-4 py-3">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
