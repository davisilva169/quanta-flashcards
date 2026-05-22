import { useMemo } from 'react';
import { Filter } from 'lucide-react';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { StatsScope, StatsPeriod } from '@/utils/statsAnalysis';

interface PanelFiltersProps {
  decks: Deck[];
  folders: Folder[];
  scope: StatsScope;
  period: StatsPeriod;
  onScopeChange: (s: StatsScope) => void;
  onPeriodChange: (p: StatsPeriod) => void;
}

/**
 * Filter bar shared by all stats panels: scope (everything / folder /
 * single deck) and period (trailing day window).
 *
 * Scope is encoded as a single string value in the underlying <select>:
 *   "all"           — every deck
 *   "folder:<id>"   — every deck in folder
 *   "deck:<id>"     — one specific deck
 * The change handler decodes and emits the typed Scope union.
 */
export function PanelFilters({
  decks,
  folders,
  scope,
  period,
  onScopeChange,
  onPeriodChange,
}: PanelFiltersProps) {
  // Encode the current scope back into the select's string value.
  const scopeValue = useMemo(() => {
    if (scope.kind === 'all') return 'all';
    if (scope.kind === 'folder') return `folder:${scope.folderId}`;
    return `deck:${scope.deckId}`;
  }, [scope]);

  // Decks grouped by folder so the optgroups in the select are tidy.
  const decksByFolder = useMemo(() => {
    const out = new Map<string | null, Deck[]>();
    for (const d of decks) {
      const k = d.folderId ?? null;
      const arr = out.get(k) ?? [];
      arr.push(d);
      out.set(k, arr);
    }
    return out;
  }, [decks]);

  function onScopeSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === 'all') return onScopeChange({ kind: 'all' });
    if (v.startsWith('folder:')) {
      return onScopeChange({ kind: 'folder', folderId: v.slice(7) });
    }
    if (v.startsWith('deck:')) {
      return onScopeChange({ kind: 'deck', deckId: v.slice(5) });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-subtle mb-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        <Filter size={11} />
        Filtros
      </div>

      {/* Scope */}
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Escopo
        <select
          value={scopeValue}
          onChange={onScopeSelect}
          className="rounded-md border border-divider bg-input px-2 py-1 text-xs text-primary outline-none focus:border-accent"
        >
          <option value="all">Tudo</option>
          {folders.length > 0 && (
            <optgroup label="Pastas">
              {folders.map(f => (
                <option key={f.id} value={`folder:${f.id}`}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
          {decksByFolder.get(null) && (
            <optgroup label="Baralhos soltos">
              {decksByFolder.get(null)!.map(d => (
                <option key={d.id} value={`deck:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          )}
          {folders.map(f => {
            const fDecks = decksByFolder.get(f.id);
            if (!fDecks || fDecks.length === 0) return null;
            return (
              <optgroup key={f.id} label={`Baralhos · ${f.name}`}>
                {fDecks.map(d => (
                  <option key={d.id} value={`deck:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      {/* Period */}
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Período
        <select
          value={String(period)}
          onChange={e => {
            const v = e.target.value;
            onPeriodChange(v === 'all' ? 'all' : (Number(v) as StatsPeriod));
          }}
          className="rounded-md border border-divider bg-input px-2 py-1 text-xs text-primary outline-none focus:border-accent"
        >
          <option value="7">7 dias</option>
          <option value="30">Último mês</option>
          <option value="90">3 meses</option>
          <option value="365">1 ano</option>
          <option value="all">Tudo</option>
        </select>
      </label>
    </div>
  );
}
