import { useMemo, useState } from 'react';
import katex from 'katex';
import {
  LATEX_SHORTCUTS,
  SHORTCUT_GROUP_LABELS,
  GROUP_ORDER,
  type LatexShortcut,
  type ShortcutGroup,
} from '@/utils/latexShortcuts';

/**
 * Tiny KaTeX renderer used inside shortcut buttons.
 *
 * We render with KaTeX directly (skipping react-markdown) for performance:
 * with ~80 buttons spread across tabs, going through the full Markdown
 * pipeline for each one is wasteful.
 *
 * The wrapper enforces a hard size box. Any preview that would otherwise
 * overflow the button (matrices, multi-line cases) gets clipped instead of
 * leaking into siblings.
 */
function KatexPreview({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
        displayMode: false,
      });
    } catch {
      return tex;
    }
  }, [tex]);
  return (
    <span
      className="pointer-events-none flex max-h-6 max-w-full select-none items-center justify-center overflow-hidden text-[12px] leading-none"
      // KaTeX HTML is sanitized by KaTeX itself.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface LatexShortcutBarProps {
  /**
   * Called when the user clicks a shortcut. The parent should perform the
   * insertion using `insertShortcut`. The bar no longer carries an inline
   * toggle — `block` from the shortcut metadata decides delimiters.
   */
  onPick: (shortcut: LatexShortcut) => void;
  disabled?: boolean;
}

export function LatexShortcutBar({ onPick, disabled }: LatexShortcutBarProps) {
  const [activeGroup, setActiveGroup] = useState<ShortcutGroup>('estrutura');

  const shortcuts = useMemo(
    () => LATEX_SHORTCUTS.filter(s => s.group === activeGroup),
    [activeGroup],
  );

  return (
    <div
      className={`rounded-lg border border-divider bg-card ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-divider p-2">
        {GROUP_ORDER.map(g => (
          <button
            key={g}
            type="button"
            onClick={() => setActiveGroup(g)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeGroup === g
                ? 'bg-accent text-on-accent shadow-soft'
                : 'text-muted hover:bg-card-hover hover:text-primary'
            }`}
          >
            {SHORTCUT_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {/* Buttons grid */}
      <div className="grid grid-cols-3 gap-1 p-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8">
        {shortcuts.map((s, i) => (
          <button
            key={`${s.group}-${i}-${s.label}`}
            type="button"
            onClick={() => onPick(s)}
            title={`${s.label} — clique para inserir`}
            className="group flex h-12 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-subtle bg-surface-2 px-1 text-primary transition-colors hover:border-accent/40 hover:bg-accent-soft"
          >
            <KatexPreview tex={s.preview} />
            <span className="truncate text-[9px] uppercase tracking-wide text-faint group-hover:text-accent-fg/80">
              {s.label}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-divider px-3 py-1.5 text-[11px] text-faint">
        Inserções automáticas com{' '}
        <code className="text-secondary">$ … $</code> (inline) ou{' '}
        <code className="text-secondary">$$ … $$</code> (bloco). Selecione texto
        antes de clicar para envolvê-lo.
      </div>
    </div>
  );
}
