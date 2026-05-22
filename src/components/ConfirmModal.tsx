import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { Portal } from './Portal';

/**
 * CONFIRM MODAL — replacement for `window.confirm`.
 * ============================================================================
 * The native `window.confirm` is blocking, ugly, and bypasses the design
 * system entirely (it inherits the OS chrome and ignores Quanta's theme).
 * This module provides a themed, accessible, Promise-based replacement that
 * call sites can drop into existing code with minimal rewrites:
 *
 *   // before
 *   if (!confirm('Deletar baralho?')) return;
 *
 *   // after
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: 'Deletar baralho?', tone: 'danger' }))) return;
 *
 * Architecture:
 *   - <ConfirmProvider> mounts once near the root (App.tsx) and holds the
 *     single instance of the modal. Children call useConfirm() to get the
 *     opener function.
 *   - The opener returns a Promise<boolean> that resolves to true on
 *     "Confirmar" and false on "Cancelar" / Esc / backdrop click.
 *   - Concurrent calls aren't supported — if one is open and another is
 *     made, the previous resolves to false first, then the new one opens.
 *     This matches `window.confirm` behavior (you can't stack two).
 *
 * Visual parity with the rest of the app:
 *   - Same backdrop treatment as RewardModal / MoveToFolderModal:
 *     `bg-black/70 backdrop-blur-sm`.
 *   - Same surface tokens: `bg-elevated`, `border-divider`, `shadow-elevated`.
 *   - Danger tone uses `danger-soft`/`danger-fg`/`danger` semantic tokens —
 *     adapts to both themes automatically.
 *   - Esc cancels, Enter confirms. Focus moves to the primary button on
 *     open so keyboard users can confirm without reaching for the mouse.
 * ============================================================================
 */

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  /** Title above the message. Defaults to "Confirmar". */
  title?: string;
  /** Body text. `\n` becomes a paragraph break. */
  message: string;
  /** Primary button label. Defaults to "Confirmar". */
  confirmLabel?: string;
  /** Secondary button label. Defaults to "Cancelar". */
  cancelLabel?: string;
  /**
   * 'danger' = destructive action (delete, reset, overwrite). Colors the
   * primary button red, swaps the icon for a warning triangle, and adds a
   * subtle danger-tinted fill around the icon.
   * 'default' = everything else (e.g., "Sair sem salvar?").
   */
  tone?: ConfirmTone;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Mount once near the root. Provides the imperative `useConfirm` hook to
 * descendants and renders the single modal instance.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // We keep the last opts in a ref so the exit animation can keep rendering
  // the right text after `pending` flips to null. Without this, the modal
  // would flash to defaults on its way out.
  const lastOptsRef = useRef<ConfirmOptions | null>(null);

  const confirm = useCallback<ConfirmFn>(opts => {
    return new Promise<boolean>(resolve => {
      setPending(prev => {
        // If something was already open, resolve it as cancelled first.
        // (Matches `window.confirm` — you can't have two open at once.)
        prev?.resolve(false);
        lastOptsRef.current = opts;
        return { opts, resolve };
      });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      setPending(prev => {
        prev?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        opts={pending?.opts ?? lastOptsRef.current}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Get the imperative confirm function. Throws if called outside a
 * <ConfirmProvider> — that's a setup bug, not a runtime condition.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      'useConfirm() requires <ConfirmProvider> in the React tree.',
    );
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: the actual dialog
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  opts: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ open, opts, onConfirm, onCancel }: ConfirmDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Esc cancels, Enter confirms. Window-level listeners because the
  // backdrop click already handles outside clicks, and we want the
  // shortcuts to work whether or not the dialog has focus.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && !e.repeat) {
        // Don't hijack Enter inside a focused input/textarea (the user is
        // likely typing). But the primary button gets focus on open, so the
        // common path is "Enter to confirm" working as expected.
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  // Move focus to the primary button on open, so keyboard users can
  // confirm/cancel without touching the mouse.
  useEffect(() => {
    if (!open) return;
    // One tick — the button needs to be mounted by AnimatePresence first.
    const t = window.setTimeout(() => primaryRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const tone: ConfirmTone = opts?.tone ?? 'default';
  const title = opts?.title ?? 'Confirmar';
  const message = opts?.message ?? '';
  const confirmLabel = opts?.confirmLabel ?? 'Confirmar';
  const cancelLabel = opts?.cancelLabel ?? 'Cancelar';

  // Split on \n so multi-paragraph messages (used in the deck-delete and
  // category-delete flows) render as separate paragraphs, not collapsed.
  const paragraphs = message.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const Icon = tone === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={e => e.stopPropagation()}
              className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-elevated shadow-elevated"
            >
              {/* Header */}
              <div className="flex items-start gap-3 border-b border-divider p-4">
                <div
                  className={`shrink-0 rounded-lg p-2 ${
                    tone === 'danger'
                      ? 'bg-danger-soft text-danger-fg'
                      : 'bg-accent-soft text-accent-fg'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div
                  id="confirm-title"
                  className="flex-1 pt-0.5 text-sm font-medium text-primary"
                >
                  {title}
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="shrink-0 rounded-full p-1.5 text-muted hover:tint-2 hover:text-primary"
                  aria-label="Cancelar"
                  title="Cancelar (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-2 px-4 py-4">
                {paragraphs.length === 0 ? (
                  <p className="text-sm text-secondary">{message}</p>
                ) : (
                  paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-secondary whitespace-pre-line"
                    >
                      {p}
                    </p>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-divider bg-surface-2 px-4 py-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-3 py-1.5 text-sm text-secondary hover:tint-2"
                >
                  {cancelLabel}
                </button>
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={onConfirm}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    tone === 'danger'
                      ? 'bg-danger text-on-accent hover:opacity-90'
                      : 'bg-accent text-on-accent hover:bg-accent-400'
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
