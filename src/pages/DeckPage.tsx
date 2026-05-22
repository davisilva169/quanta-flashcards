import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Play,
  Trash2,
  Pencil,
  AlertCircle,
  FolderInput,
  Layers,
  Download,
} from 'lucide-react';
import {
  db,
  moveDeckToFolder,
  deleteCardAttachments,
  deleteDeckAttachments,
} from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import { FlashcardCard } from '@/components/FlashcardCard';
import type { Attachment } from '@/types/attachment';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { MoveToFolderModal } from '@/components/MoveToFolderModal';
import { ColorPicker } from '@/components/ColorPicker';
import { useConfirm } from '@/components/ConfirmModal';
import { deckProgress } from '@/utils/stats';
import { now } from '@/utils/dates';
import {
  buildDeckExport,
  downloadDeckJson,
  type DeckAttachmentExport,
} from '@/utils/deckExport';
import { blobToDataUrl } from '@/utils/attachments';
import {
  DEFAULT_COLOR,
  resolveColor,
  withAlpha,
} from '@/utils/folderColors';
import type { Route } from '@/components/Sidebar';

interface Props {
  deckId: string;
  onNavigate: (r: Route) => void;
}

export function DeckPage({ deckId, onNavigate }: Props) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [parentFolder, setParentFolder] = useState<Folder | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  /**
   * Map from cardId to its attachments. Built once per refresh so the list
   * of FlashcardCards can pass the right attachments to each child without
   * one query per card. The map is rebuilt whenever the cards change
   * (delete cascade, save from editor, etc.).
   */
  const [attachmentsByCard, setAttachmentsByCard] = useState<
    Map<string, Attachment[]>
  >(() => new Map());
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [moveOpen, setMoveOpen] = useState(false);
  const confirm = useConfirm();

  async function refresh() {
    const d = await db.decks.get(deckId);
    setDeck(d ?? null);
    if (d) {
      setName(d.name);
      setDescription(d.description);
      setColor(resolveColor(d.colorKey).hex);
      setParentFolder(d.folderId ? (await db.folders.get(d.folderId)) ?? null : null);
    }
    const cardList = await db.cards.where('deckId').equals(deckId).toArray();
    setCards(cardList);
    setLogs(await db.reviewLogs.where('deckId').equals(deckId).toArray());

    // Load attachments for ALL cards in this deck in a single query and
    // group by cardId. The alternative (one query per card) would scale
    // badly with deck size; this one round-trips Dexie once.
    if (cardList.length === 0) {
      setAttachmentsByCard(new Map());
    } else {
      const cardIds = cardList.map(c => c.id);
      const atts = await db.attachments
        .where('cardId')
        .anyOf(cardIds)
        .toArray();
      const grouped = new Map<string, Attachment[]>();
      for (const a of atts) {
        const arr = grouped.get(a.cardId);
        if (arr) arr.push(a);
        else grouped.set(a.cardId, [a]);
      }
      setAttachmentsByCard(grouped);
    }
  }

  useEffect(() => {
    refresh();
  }, [deckId]);

  const progress = useMemo(() => deckProgress(cards, logs), [cards, logs]);
  const dueCount = useMemo(
    () => cards.filter(c => c.due <= now()).length,
    [cards],
  );

  async function saveMeta() {
    if (!deck) return;
    const updated: Deck = {
      ...deck,
      name: name.trim(),
      description: description.trim(),
      colorKey: color,
      updatedAt: Date.now(),
    };
    await db.decks.put(updated);
    setDeck(updated);
    setEditingMeta(false);
  }

  async function deleteDeck() {
    if (!deck) return;
    const ok = await confirm({
      title: 'Deletar baralho',
      message:
        `Deletar baralho "${deck.name}" e todos os ${cards.length} cartões?\n\n` +
        `Esta ação não pode ser desfeita.`,
      tone: 'danger',
      confirmLabel: 'Deletar',
    });
    if (!ok) return;
    await db.transaction(
      'rw',
      db.decks,
      db.cards,
      db.reviewLogs,
      db.attachments,
      async () => {
        // Order matters less here because we're using cardId lookups, but
        // we delete attachments FIRST while the card primaryKeys are still
        // resolvable from `cards.where('deckId')`. After the cards are
        // gone, that lookup would return nothing.
        await deleteDeckAttachments(deckId);
        await db.decks.delete(deckId);
        await db.cards.where('deckId').equals(deckId).delete();
        await db.reviewLogs.where('deckId').equals(deckId).delete();
      },
    );
    onNavigate(parentFolder ? { name: 'folder', folderId: parentFolder.id } : { name: 'decks' });
  }

  /**
   * Build a single-deck export and trigger a JSON download. This is the
   * "share this deck with another Quanta" path. Distinct from the global
   * snapshot in Settings — see utils/deckExport.ts for the format.
   *
   * Attachments belonging to any card in this deck are included in the
   * export, with their binary payload converted to base64 data URLs. The
   * conversion happens here (not inside `buildDeckExport`) so the builder
   * stays a pure synchronous function — easier to test and reason about.
   */
  async function exportDeck() {
    if (!deck) return;

    // Pull all attachments belonging to the deck's cards. We resolve them
    // by `cardId` because the attachments table doesn't have a deckId
    // index — the relation goes card → deck → folder.
    const cardIds = cards.map(c => c.id);
    const dbAtts =
      cardIds.length === 0
        ? []
        : await db.attachments.where('cardId').anyOf(cardIds).toArray();

    // Serialize each Blob to a base64 data URL in parallel.
    const exportedAttachments: DeckAttachmentExport[] = await Promise.all(
      dbAtts.map(async a => ({
        id: a.id,
        cardId: a.cardId,
        type: a.type,
        mimeType: a.mimeType,
        filename: a.filename,
        size: a.size,
        data: await blobToDataUrl(a.data),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    );

    const payload = buildDeckExport(deck, cards, parentFolder, exportedAttachments);
    downloadDeckJson(payload, deck.name);
  }

  async function deleteCard(cardId: string) {
    const ok = await confirm({
      title: 'Deletar cartão',
      message: 'Deletar este cartão? Esta ação não pode ser desfeita.',
      tone: 'danger',
      confirmLabel: 'Deletar',
    });
    if (!ok) return;
    await db.transaction('rw', db.cards, db.attachments, async () => {
      await deleteCardAttachments(cardId);
      await db.cards.delete(cardId);
    });
    await refresh();
  }

  async function handleMove(newFolderId: string | null) {
    setMoveOpen(false);
    await moveDeckToFolder(deckId, newFolderId);
    await refresh();
  }

  if (!deck) {
    return (
      <div className="text-muted space-y-4">
        <Breadcrumbs
          showHome
          onHome={() => onNavigate({ name: 'home' })}
          items={[
            { label: 'Baralhos', onClick: () => onNavigate({ name: 'decks' }) },
            { label: 'Não encontrado' },
          ]}
        />
        <p>Baralho não encontrado.</p>
      </div>
    );
  }

  const resolved = resolveColor(deck.colorKey);

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        showHome
        onHome={() => onNavigate({ name: 'home' })}
        items={[
          { label: 'Baralhos', onClick: () => onNavigate({ name: 'decks' }) },
          ...(parentFolder
            ? [
                {
                  label: parentFolder.name,
                  onClick: () =>
                    onNavigate({ name: 'folder', folderId: parentFolder.id }),
                },
              ]
            : []),
          { label: deck.name },
        ]}
      />

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          {editingMeta ? (
            <div className="space-y-2 max-w-2xl">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none text-lg font-medium"
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none text-sm resize-none h-20"
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
                  onClick={() => setEditingMeta(false)}
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
                <Layers className="h-5 w-5" style={{ color: resolved.hex }} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-primary">
                  {deck.name}
                </h1>
                {deck.description && (
                  <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
                    {deck.description}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!editingMeta && (
            <>
              <button
                onClick={() => setMoveOpen(true)}
                className="flex items-center gap-2 p-2 rounded-lg text-muted hover:bg-card-hover hover:text-primary text-sm transition-colors"
                title="Mover para pasta"
              >
                <FolderInput size={16} />
                <span className="hidden sm:inline">Mover</span>
              </button>
              <button
                onClick={() => setEditingMeta(true)}
                className="p-2 rounded-lg text-muted hover:bg-card-hover hover:text-primary transition-colors"
                title="Editar"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={exportDeck}
                className="p-2 rounded-lg text-muted hover:bg-card-hover hover:text-primary transition-colors"
                title="Exportar baralho (JSON)"
                aria-label="Exportar baralho"
              >
                <Download size={16} />
              </button>
              <button
                onClick={deleteDeck}
                className="p-2 rounded-lg text-muted hover:bg-danger-soft hover:text-danger-fg"
                title="Deletar baralho"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button
            onClick={() =>
              onNavigate({ name: 'create-card', deckId: deck.id })
            }
            className="flex items-center gap-2 px-3 py-2 rounded-lg tint-2 hover:tint-3 text-sm transition-colors"
          >
            <Plus size={14} /> Novo cartão
          </button>
          <button
            onClick={() => onNavigate({ name: 'review', deckId: deck.id })}
            disabled={dueCount === 0 && progress.novos === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 disabled:opacity-50 text-on-accent text-sm font-medium transition-colors"
          >
            <Play size={14} /> Revisar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={progress.total} />
        <StatCard
          label="Vencidos"
          value={progress.vencidos}
          accent={progress.vencidos > 0}
        />
        <StatCard label="Maduros" value={progress.maduros} />
        <StatCard label="Novos" value={progress.novos} />
        <StatCard
          label="Acerto"
          value={`${Math.round(progress.taxaAcerto * 100)}%`}
        />
      </div>

      {progress.atrasados > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-warning-soft border border-warning/30 text-warning-fg text-sm">
          <AlertCircle size={14} />
          {progress.atrasados} cartão(ões) atrasados — revise para evitar
          perda de retenção.
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum cartão neste baralho."
          description="Adicione seu primeiro cartão. Você pode usar Markdown e LaTeX."
          action={
            <button
              onClick={() =>
                onNavigate({ name: 'create-card', deckId: deck.id })
              }
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 text-on-accent text-sm"
            >
              Criar cartão
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <FlashcardCard
              key={card.id}
              card={card}
              attachments={attachmentsByCard.get(card.id)}
              onEdit={() => onNavigate({ name: 'edit-card', cardId: card.id })}
              onDelete={() => deleteCard(card.id)}
            />
          ))}
        </div>
      )}

      <MoveToFolderModal
        open={moveOpen}
        currentFolderId={deck.folderId ?? null}
        onClose={() => setMoveOpen(false)}
        onPick={handleMove}
      />
    </div>
  );
}
