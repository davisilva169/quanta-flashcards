import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/database';
import type {
  CardInteraction,
  CardCategory,
  Flashcard,
} from '@/types/flashcard';
import type { Attachment } from '@/types/attachment';
import type { CardSpeech } from '@/types/speech';
import type { Route } from '@/components/Sidebar';
import { CardEditor } from '@/components/CardEditor';

interface Props {
  cardId: string;
  onNavigate: (r: Route) => void;
}

export function EditCardPage({ cardId, onNavigate }: Props) {
  const [card, setCard] = useState<Flashcard | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /**
   * Gate flag for the initial fetch. Without it, the CardEditor would
   * mount on the FIRST setState (card loaded, attachments still empty)
   * and its `useState(() => initialAttachments)` initializer would lock
   * in `attachments = []` — even after the second setState arrived, the
   * editor's internal state wouldn't catch up (initializers only run on
   * mount). The result was the user opening a card for edit and seeing
   * "Imagem ausente" in the preview while the actual attachment was
   * still safe in the DB (so review kept working).
   *
   * Fix: load BOTH the card and its attachments before the first
   * setState. React 18 batches the two setters into one render because
   * there's no `await` between them. We expose `loaded` so the render
   * tree only mounts CardEditor once everything is in place.
   */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    let cancelled = false;
    (async () => {
      const c = await db.cards.get(cardId);
      if (!c) {
        if (cancelled) return;
        setCard(null);
        setAttachments([]);
        setLoaded(true);
        return;
      }
      const atts = await db.attachments
        .where('cardId')
        .equals(cardId)
        .toArray();
      if (cancelled) return;
      // Both fetches are done. These three setStates are batched into a
      // single render under React 18's automatic batching (no awaits in
      // between), so CardEditor mounts with `loaded === true` AND the
      // real attachments array on the very first render.
      setCard(c);
      setAttachments(atts);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function save({
    front,
    back,
    type,
    interaction,
    attachments: nextAttachments,
    removedIds,
    speech,
  }: {
    front: string;
    back: string;
    type: CardCategory;
    interaction: CardInteraction;
    attachments: Attachment[];
    removedIds: string[];
    speech: CardSpeech | undefined;
  }) {
    if (!card) return;
    const ts = Date.now();

    // Make sure every attachment in the final set has the correct cardId.
    // Newly added ones from the editor came in with `cardId === ''`; existing
    // ones keep theirs.
    const finalAttachments: Attachment[] = nextAttachments.map(a => ({
      ...a,
      cardId: card.id,
      updatedAt: ts,
    }));

    // Save card + attachments atomically.
    //   - card.put: upserts the modified card.
    //   - attachments.bulkPut: handles BOTH new (insert) and kept (no-op,
    //     same content) — `put` semantics in Dexie are "insert or replace".
    //   - attachments.bulkDelete: removes anything the user took out.
    //
    // For `speech` we explicitly set it to the new value (record or
    // `undefined`). Spreading `{ speech }` with an `undefined` value keeps
    // the property KEY but with `undefined` value — Dexie's `put` then
    // writes `undefined` into the row. That's what we want for the
    // "user removed narration from a card that had it" case: the property
    // exists but is `undefined`, and `card.speech?.frontEnabled` returns
    // `undefined` (falsy) in the review screen. No button shows up.
    await db.transaction('rw', db.cards, db.attachments, async () => {
      const updated: Flashcard = {
        ...card,
        front,
        back,
        type,
        interaction: interaction.kind === 'classic' ? undefined : interaction,
        speech,
        updatedAt: ts,
      };
      await db.cards.put(updated);

      if (finalAttachments.length > 0) {
        await db.attachments.bulkPut(finalAttachments);
      }
      if (removedIds.length > 0) {
        await db.attachments.bulkDelete(removedIds);
      }
    });

    onNavigate({ name: 'deck', deckId: card.deckId });
  }

  // Don't render anything until BOTH fetches resolved. Without this, the
  // CardEditor would mount with stale `initialAttachments`. See comment
  // on the `loaded` state above.
  if (!loaded) return null;
  if (!card) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={() => onNavigate({ name: 'deck', deckId: card.deckId })}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-muted hover:bg-card-hover hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> Voltar ao baralho
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Editar cartão</h1>

      <CardEditor
        initialFront={card.front}
        initialBack={card.back}
        initialType={card.type}
        initialInteraction={card.interaction}
        initialAttachments={attachments}
        initialSpeech={card.speech}
        onSave={save}
        onCancel={() =>
          onNavigate({ name: 'deck', deckId: card.deckId })
        }
        saveLabel="Salvar alterações"
      />
    </div>
  );
}
