import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ERROR BOUNDARY
 * ============================================================================
 * Catches any exception thrown during the render of its descendants. Without
 * this, a single bad render in any component blanks the entire app — the
 * React tree is unmounted, leaving the user with the background gradient
 * and no chrome (it's happened: see the `setFront(undefined)` regression
 * in CardEditor that this boundary was added to backstop).
 *
 * What the user sees on a crash:
 *   - The app chrome stays up (Sidebar + Layout remain mounted because the
 *     boundary is INSIDE the layout, around the routed page content).
 *   - A friendly error card replaces the page area, with the error
 *     message and a button to try recovering (resets the boundary state).
 *
 * Errors are logged to console with `console.error` so DevTools can show
 * the stack. We deliberately don't show the stack to the user — that's
 * noise for someone who just wants to keep studying. They can hit the
 * "Tentar novamente" button or refresh.
 *
 * NOTE: class component because React error boundaries require the legacy
 * lifecycle hooks (`getDerivedStateFromError`, `componentDidCatch`). No
 * functional equivalent exists yet.
 */

interface Props {
  children: ReactNode;
  /** Optional reset key — when it changes, the boundary clears its error. */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surface to DevTools so the user can copy the stack into a bug report.
    // eslint-disable-next-line no-console
    console.error('[Quanta] Render crash caught by ErrorBoundary:', error, info);
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-recover when the parent passes a new resetKey (e.g. route change).
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-danger/30 bg-card p-6 shadow-card">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-danger-soft p-2 text-danger-fg">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-medium text-primary">
                  Algo deu errado ao desenhar esta tela
                </h2>
                <p className="mt-1 text-sm text-secondary">
                  Seus dados não foram afetados — o problema é só na
                  renderização desta página específica.
                </p>
                <div className="mt-3 rounded-md border border-subtle bg-surface-2 p-2 font-mono text-[11px] text-muted">
                  {this.state.error.message || String(this.state.error)}
                </div>
                <button
                  type="button"
                  onClick={() => this.setState({ error: null })}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-400"
                >
                  <RefreshCw size={13} />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
