import { useEffect, useMemo, useState } from 'react';
import { Plus, FolderPlus, Layers, Upload } from 'lucide-react';
import { db, moveDeckToFolder } from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import { DeckCard } from '@/components/DeckCard';
import { FolderCard } from '@/components/FolderCard';
import { EmptyState } from '@/components/EmptyState';
import { ImportDeckModal } from '@/components/ImportDeckModal';
import { deckProgress } from '@/utils/stats';
import { now } from '@/utils/dates';
import type { Route } from '@/components/Sidebar';

interface Props {
  onNavigate: (r: Route) => void;
}

/**
 * Custom MIME for the drag payload. Keeps the drop zones from confusing
 * other native drags (text, files) with our deck drags.
 */
const DRAG_MIME = 'application/x-quanta-deckid';

export function DecksPage({ onNavigate }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);

  // DnD state — kept here at the page level since both source (deck) and
  // target (folder) live as siblings under this component.
  const [draggingDeckId, setDraggingDeckId] = useState<string | null>(null);
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function loadAll() {
    setFolders(await db.folders.orderBy('name').toArray());
    setDecks(await db.decks.toArray());
    setCards(await db.cards.toArray());
    setLogs(await db.reviewLogs.toArray());
  }

  useEffect(() => {
    loadAll();
  }, []);

  const looseDecks = useMemo(
    () => decks.filter(d => d.folderId === null || d.folderId === undefined),
    [decks],
  );

  // Pre-compute folder summaries to avoid filtering inside the render loop.
  const folderSummaries = useMemo(() => {
    const map = new Map<string, { decks: number; cards: number; due: number }>();
    for (const f of folders) map.set(f.id, { decks: 0, cards: 0, due: 0 });
    for (const d of decks) {
      if (!d.folderId) continue;
      const sum = map.get(d.folderId);
      if (!sum) continue;
      sum.decks += 1;
      const dCards = cards.filter(c => c.deckId === d.id);
      sum.cards += dCards.length;
      sum.due += dCards.filter(c => c.due <= now()).length;
    }
    return map;
  }, [folders, decks, cards]);

  const totallyEmpty = folders.length === 0 && decks.length === 0;

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart(deck: Deck) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, deck.id);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingDeckId(deck.id);
    };
  }

  function handleDragEnd() {
    setDraggingDeckId(null);
    setHoveredFolderId(null);
  }

  function handleDragOver(folderId: string) {
    return (e: React.DragEvent) => {
      // Only react if it's our drag — avoids highlighting on random text drags.
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault(); // required to enable drop
      e.dataTransfer.dropEffect = 'move';
      if (hoveredFolderId !== folderId) setHoveredFolderId(folderId);
    };
  }

  function handleDragLeave(folderId: string) {
    return (_e: React.DragEvent) => {
      // We only clear if we're still pointing at the same folder; otherwise a
      // child element flicker can race with onDragOver.
      if (hoveredFolderId === folderId) setHoveredFolderId(null);
    };
  }

  function handleDrop(folderId: string) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      const deckId = e.dataTransfer.getData(DRAG_MIME);
      setDraggingDeckId(null);
      setHoveredFolderId(null);
      if (!deckId) return;
      // No-op if it's already inside this folder
      const deck = decks.find(d => d.id === deckId);
      if (!deck || deck.folderId === folderId) return;
      await moveDeckToFolder(deckId, folderId);
      await loadAll();
    };
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Baralhos</h1>
          <p className="text-sm text-muted mt-1">
            Organize por pasta — disciplina, livro, semestre — ou deixe baralhos
            soltos para tópicos avulsos.
            {looseDecks.length > 0 && folders.length > 0 && (
              <>
                {' '}
                <span className="text-faint">
                  Arraste um baralho solto para dentro de uma pasta.
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-divider bg-card px-3 py-2 text-sm text-primary transition-colors hover:bg-card-hover hover:border-strong"
            title="Importar um baralho exportado de outro Quanta"
          >
            <Upload size={15} />
            Importar baralho
          </button>
          <button
            onClick={() => onNavigate({ name: 'create-folder' })}
            className="flex items-center gap-2 rounded-lg border border-divider bg-card px-3 py-2 text-sm text-primary transition-colors hover:bg-card-hover hover:border-strong"
          >
            <FolderPlus size={15} />
            Nova pasta
          </button>
          <button
            onClick={() => onNavigate({ name: 'create-deck' })}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
          >
            <Plus size={15} />
            Novo baralho
          </button>
        </div>
      </header>

      {totallyEmpty ? (
        <EmptyState
          icon={<Layers size={20} />}
          title="Nada por aqui ainda."
          description="Comece criando uma pasta para um curso ou disciplina, ou um baralho avulso para um tópico isolado."
          action={
            <div className="flex gap-2">
              <button
                onClick={() => onNavigate({ name: 'create-folder' })}
                className="rounded-lg border border-divider tint-1 px-4 py-2 text-sm text-primary hover:tint-2"
              >
                Criar pasta
              </button>
              <button
                onClick={() => onNavigate({ name: 'create-deck' })}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-400"
              >
                Criar baralho
              </button>
            </div>
          }
        />
      ) : (
        <>
          {folders.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] uppercase tracking-widest text-muted">
                Pastas
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {folders.map(f => {
                  const s = folderSummaries.get(f.id) ?? { decks: 0, cards: 0, due: 0 };
                  return (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      deckCount={s.decks}
                      totalCards={s.cards}
                      dueCount={s.due}
                      onClick={() => onNavigate({ name: 'folder', folderId: f.id })}
                      isDropTarget={hoveredFolderId === f.id}
                      onDragOver={handleDragOver(f.id)}
                      onDragLeave={handleDragLeave(f.id)}
                      onDrop={handleDrop(f.id)}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {looseDecks.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] uppercase tracking-widest text-muted">
                {folders.length > 0 ? 'Baralhos soltos' : 'Baralhos'}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {looseDecks.map(deck => {
                  const dCards = cards.filter(c => c.deckId === deck.id);
                  const dLogs = logs.filter(l => l.deckId === deck.id);
                  return (
                    <DeckCard
                      key={deck.id}
                      deck={deck}
                      progress={deckProgress(dCards, dLogs)}
                      onOpen={() => onNavigate({ name: 'deck', deckId: deck.id })}
                      draggable={folders.length > 0}
                      onDragStart={handleDragStart(deck)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingDeckId === deck.id}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {folders.length > 0 && looseDecks.length === 0 && (
            <p className="text-sm text-faint">
              Sem baralhos soltos. Todos estão organizados em pastas — bom
              trabalho.
            </p>
          )}
        </>
      )}

      {/* Single-deck import — additive, never touches existing data. */}
      <ImportDeckModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          // Refresh the list so the newly imported deck appears without
          // requiring the user to leave and come back.
          loadAll();
        }}
      />
    </div>
  );
}
