import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Layers, Folder as FolderIcon } from 'lucide-react';
import { db, deleteFolder } from '@/db/database';
import type { Folder } from '@/types/folder';
import type { Deck } from '@/types/deck';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { DeckCard } from '@/components/DeckCard';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { ColorPicker } from '@/components/ColorPicker';
import { useConfirm } from '@/components/ConfirmModal';
import { deckProgress } from '@/utils/stats';
import { now } from '@/utils/dates';
import {
  DEFAULT_COLOR,
  resolveColor,
  withAlpha,
} from '@/utils/folderColors';
import type { Route } from '@/components/Sidebar';

interface Props {
  folderId: string;
  onNavigate: (r: Route) => void;
}

export function FolderPage({ folderId, onNavigate }: Props) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const confirm = useConfirm();

  async function refresh() {
    const f = await db.folders.get(folderId);
    if (!f) {
      setFolder(null);
      return;
    }
    setFolder(f);
    setName(f.name);
    setDescription(f.description ?? '');
    setColor(resolveColor(f.colorKey).hex);

    const folderDecks = await db.decks.where('folderId').equals(folderId).toArray();
    setDecks(folderDecks);

    if (folderDecks.length > 0) {
      const ids = folderDecks.map(d => d.id);
      setCards(await db.cards.where('deckId').anyOf(ids).toArray());
      setLogs(await db.reviewLogs.where('deckId').anyOf(ids).toArray());
    } else {
      setCards([]);
      setLogs([]);
    }
  }

  useEffect(() => {
    refresh();
  }, [folderId]);

  const aggregate = useMemo(() => {
    const total = cards.length;
    const due = cards.filter(c => c.due <= now()).length;
    const correct = logs.filter(l => l.rating > 1).length;
    const acerto = logs.length === 0 ? 0 : correct / logs.length;
    return { total, due, acerto };
  }, [cards, logs]);

  async function saveMeta() {
    if (!folder) return;
    const updated: Folder = {
      ...folder,
      name: name.trim(),
      description: description.trim() || undefined,
      colorKey: color,
      updatedAt: Date.now(),
    };
    await db.folders.put(updated);
    setFolder(updated);
    setEditing(false);
  }

  async function handleDelete() {
    if (!folder) return;
    const deckCount = decks.length;
    const message =
      deckCount === 0
        ? `Deletar pasta "${folder.name}"?`
        : `Deletar pasta "${folder.name}"?\n\nOs ${deckCount} baralho${
            deckCount === 1 ? '' : 's'
          } dentro dela vão ficar soltos (não serão apagados).`;
    const ok = await confirm({
      title: 'Deletar pasta',
      message,
      tone: 'danger',
      confirmLabel: 'Deletar',
    });
    if (!ok) return;
    await deleteFolder(folder.id);
    onNavigate({ name: 'decks' });
  }

  if (!folder) {
    return (
      <div className="text-muted space-y-4">
        <Breadcrumbs
          showHome
          onHome={() => onNavigate({ name: 'home' })}
          items={[
            { label: 'Baralhos', onClick: () => onNavigate({ name: 'decks' }) },
            { label: 'Pasta não encontrada' },
          ]}
        />
        <p>Esta pasta foi removida ou não existe.</p>
      </div>
    );
  }

  const resolved = resolveColor(folder.colorKey);

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        showHome
        onHome={() => onNavigate({ name: 'home' })}
        items={[
          { label: 'Baralhos', onClick: () => onNavigate({ name: 'decks' }) },
          { label: folder.name },
        ]}
      />

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-3 max-w-2xl">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none text-lg font-medium"
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Descrição (opcional)"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none text-sm resize-none"
              />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-faint mb-2">
                  Cor
                </div>
                <ColorPicker value={color} onChange={setColor} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveMeta}
                  className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-400 text-on-accent text-sm"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-md hover:tint-2 text-muted text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div
                className="rounded-lg p-2 mt-1"
                style={{ backgroundColor: withAlpha(resolved.hex, 0.12) }}
              >
                <FolderIcon className="h-5 w-5" style={{ color: resolved.hex }} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-primary">
                  {folder.name}
                </h1>
                {folder.description && (
                  <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
                    {folder.description}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-2 rounded-lg text-muted hover:bg-card-hover hover:text-primary transition-colors"
                title="Editar pasta"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-muted hover:bg-danger-soft hover:text-danger-fg"
                title="Deletar pasta (baralhos ficam soltos)"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button
            onClick={() =>
              onNavigate({ name: 'create-deck', folderId: folder.id })
            }
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent-400 text-on-accent text-sm font-medium"
          >
            <Plus size={14} /> Novo baralho aqui
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Baralhos" value={decks.length} />
        <StatCard label="Cartões" value={aggregate.total} />
        <StatCard
          label="Vencidos"
          value={aggregate.due}
          accent={aggregate.due > 0}
        />
        <StatCard
          label="Acerto"
          value={`${Math.round(aggregate.acerto * 100)}%`}
        />
      </section>

      {decks.length === 0 ? (
        <EmptyState
          icon={<Layers size={20} />}
          title="Nenhum baralho nesta pasta."
          description="Crie um baralho diretamente aqui — ele já vai entrar nesta pasta."
          action={
            <button
              onClick={() =>
                onNavigate({ name: 'create-deck', folderId: folder.id })
              }
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 text-on-accent text-sm font-medium"
            >
              Criar baralho aqui
            </button>
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map(deck => {
            const dCards = cards.filter(c => c.deckId === deck.id);
            const dLogs = logs.filter(l => l.deckId === deck.id);
            return (
              <DeckCard
                key={deck.id}
                deck={deck}
                progress={deckProgress(dCards, dLogs)}
                onOpen={() => onNavigate({ name: 'deck', deckId: deck.id })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
