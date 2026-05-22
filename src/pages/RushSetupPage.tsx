import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Zap, Layers, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { db } from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import { isRushCompatible } from '@/types/flashcard';
import { resolveColor, withAlpha } from '@/utils/folderColors';
import type { Route } from '@/components/Sidebar';

interface Props {
  onNavigate: (r: Route) => void;
}

const DURATIONS: { sec: number | null; label: string; description: string }[] = [
  { sec: 60, label: '60 s', description: 'Sprint curto.' },
  { sec: 120, label: '2 min', description: 'Aquecimento médio.' },
  { sec: 300, label: '5 min', description: 'Sessão completa.' },
  { sec: null, label: 'Livre', description: 'Sem timer; até esgotar a fila.' },
];

export function RushSetupPage({ onNavigate }: Props) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  // null = "todos os baralhos"
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(120);

  useEffect(() => {
    (async () => {
      setDecks(await db.decks.toArray());
      setFolders(await db.folders.toArray());
      setCards(await db.cards.toArray());
    })();
  }, []);

  // Count Rush-compatible cards in the user's selection.
  // Rush only includes interactive cards (MC, cloze, V/F) — classic cards
  // can't be auto-graded, so they're invisible to this mode.
  const compatibleByDeck = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) {
      if (!isRushCompatible(c)) continue;
      map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1);
    }
    return map;
  }, [cards]);

  const totalCompatible = useMemo(
    () => cards.filter(isRushCompatible).length,
    [cards],
  );

  const selectedCount =
    selectedDeckId === null
      ? totalCompatible
      : compatibleByDeck.get(selectedDeckId) ?? 0;

  function start() {
    if (selectedCount === 0) return;
    onNavigate({
      name: 'rush-session',
      deckId: selectedDeckId,
      durationSec: selectedDuration,
    });
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <button
        onClick={() => onNavigate({ name: 'home' })}
        className="flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft size={14} /> Início
      </button>

      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-on-accent">
          <Zap size={12} /> Modo Rush
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Cartões cronometrados, auto-corrigidos.
        </h1>
        <p className="mt-2 text-sm text-muted leading-relaxed max-w-2xl">
          Sem rating manual — só velocidade e precisão. Funciona apenas com
          cartões de <span className="text-primary">múltipla escolha</span>,{' '}
          <span className="text-primary">ocultar resposta</span> e{' '}
          <span className="text-primary">verdadeiro/falso</span>. Rush não
          afeta o agendamento dos cartões; os logs entram nas estatísticas
          normalmente.
        </p>
      </header>

      {totalCompatible === 0 ? (
        <div className="rounded-xl border border-dashed border-divider p-8 text-center">
          <p className="text-sm text-secondary font-medium">
            Você não tem cartões compatíveis ainda.
          </p>
          <p className="mt-2 text-xs text-faint leading-relaxed max-w-md mx-auto">
            Crie cartões dos tipos múltipla escolha, ocultar resposta ou V/F
            nos seus baralhos. Cartões clássicos não entram no Rush porque
            dependem de auto-avaliação.
          </p>
          <button
            onClick={() => onNavigate({ name: 'decks' })}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-400"
          >
            Ir para baralhos
          </button>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-muted mb-3">
              Origem dos cartões
            </h2>
            <div className="grid gap-2">
              <button
                onClick={() => setSelectedDeckId(null)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedDeckId === null
                    ? 'border-accent bg-accent-soft'
                    : 'border-divider bg-surface-2 hover:border-strong'
                }`}
              >
                <div className="rounded-md bg-accent-soft p-2">
                  <InfinityIcon size={14} className="text-accent-fg" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-primary">
                    Todos os baralhos
                  </div>
                  <div className="text-[11px] text-faint">
                    Mistura cartões compatíveis de todos os baralhos.
                  </div>
                </div>
                <div className="text-xs font-mono text-muted">
                  {totalCompatible}
                </div>
              </button>

              {decks.map(deck => {
                const count = compatibleByDeck.get(deck.id) ?? 0;
                const folder = deck.folderId
                  ? folders.find(f => f.id === deck.folderId)
                  : null;
                const color = resolveColor(deck.colorKey);
                const active = selectedDeckId === deck.id;
                const disabled = count === 0;
                return (
                  <button
                    key={deck.id}
                    disabled={disabled}
                    onClick={() => setSelectedDeckId(deck.id)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-divider bg-surface-2 hover:border-strong'
                    }`}
                  >
                    <div
                      className="rounded-md p-2"
                      style={{ backgroundColor: withAlpha(color.hex, 0.12) }}
                    >
                      <Layers size={14} style={{ color: color.hex }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-primary truncate">
                        {deck.name}
                      </div>
                      <div className="text-[11px] text-faint truncate">
                        {folder ? `${folder.name} · ` : ''}
                        {disabled
                          ? 'sem cartões compatíveis'
                          : `${count} ${count === 1 ? 'compatível' : 'compatíveis'}`}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-muted">{count}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-muted mb-3">
              Duração
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DURATIONS.map(d => {
                const active = selectedDuration === d.sec;
                return (
                  <button
                    key={d.label}
                    onClick={() => setSelectedDuration(d.sec)}
                    className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-divider bg-surface-2 hover:border-strong'
                    }`}
                  >
                    <Clock
                      size={14}
                      className={active ? 'text-accent-fg' : 'text-faint'}
                    />
                    <span
                      className={`text-base font-semibold ${
                        active ? 'text-accent-fg' : 'text-primary'
                      }`}
                    >
                      {d.label}
                    </span>
                    <span className="text-[11px] leading-tight text-faint">
                      {d.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={start}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 px-6 py-3 text-base font-semibold text-on-accent shadow-glow hover:from-orange-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={16} /> Começar Rush
            </button>
            <span className="text-xs text-faint">
              {selectedCount} {selectedCount === 1 ? 'cartão' : 'cartões'} na fila
            </span>
          </div>
        </>
      )}
    </div>
  );
}
