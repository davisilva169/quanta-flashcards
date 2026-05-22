import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, GripHorizontal } from 'lucide-react';
import { Portal } from './Portal';

interface FloatingPanelProps {
  open: boolean;
  title: string;
  /** Optional small text shown under the title (e.g., a contextual hint). */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Width in px. Defaults to 620 — wide enough for two-column content but
   * narrow enough that the user can keep the page underneath in view.
   */
  width?: number;
}

/**
 * A draggable detail panel. Designed for the Stats page: clicking a metric
 * card opens one of these on top of the page, the user can drag it around
 * by the header to compare against the underlying view, and dismiss with
 * the ✕ or by clicking outside.
 *
 * Implementation notes:
 *   - framer-motion's `useDragControls` lets only the header start a drag
 *     (otherwise clicking a select inside the body would start dragging too).
 *   - Backdrop is `bg-black/30` — light enough that the page underneath is
 *     still readable, dark enough to capture click-to-close clearly.
 *   - Escape key also closes. (Accessibility: roles + aria-modal.)
 *   - Initial position is centered-ish (CSS `inset-0` + `m-auto` keeps it
 *     centered until the user drags; after that, framer's `x`/`y` take over.)
 */
export function FloatingPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
  width = 620,
}: FloatingPanelProps) {
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes — same affordance as the close button.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — click-to-close. Pointer-events on so the click works,
                but no blur so the page underneath stays sharp / scannable. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="fixed inset-0 z-[100] bg-black/30"
            />

            {/* The panel itself. `pointer-events-none` on the centering wrapper
                + `pointer-events-auto` on the inner ensures the backdrop is
                still clickable around the panel (we want that). */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none">
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                drag
                dragMomentum={false}
                dragListener={false}
                dragControls={dragControls}
                // Wide constraints — let users park the panel almost anywhere
                // on screen. The numbers are generous on purpose; the actual
                // bounding is the viewport, which framer respects implicitly.
                dragConstraints={{
                  left: -window.innerWidth / 2 + 80,
                  right: window.innerWidth / 2 - 80,
                  top: -window.innerHeight / 2 + 60,
                  bottom: window.innerHeight / 2 - 60,
                }}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                style={{ width }}
                className="pointer-events-auto max-h-[85vh] flex flex-col rounded-2xl border border-divider bg-elevated shadow-elevated overflow-hidden"
              >
                {/* Drag handle / header. Cursor flips to `grab` so it's obvious
                    this is the draggable region. */}
                <div
                  onPointerDown={e => dragControls.start(e)}
                  className="flex items-start justify-between gap-3 px-5 py-3 border-b border-divider cursor-grab active:cursor-grabbing select-none bg-surface-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GripHorizontal size={14} className="text-faint shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tracking-tight text-primary truncate">
                        {title}
                      </div>
                      {subtitle && (
                        <div className="text-[11px] text-muted truncate">
                          {subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    onPointerDown={e => e.stopPropagation()}
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-card-hover hover:text-primary transition-colors"
                    title="Fechar (Esc)"
                    aria-label="Fechar"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Body scrolls if content exceeds max-h. */}
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}
