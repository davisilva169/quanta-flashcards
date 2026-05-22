import { ArrowLeft } from 'lucide-react';
import { db, uid } from '@/db/database';
import type { Route } from '@/components/Sidebar';
import { CardEditor } from '@/components/CardEditor';
import { newCardDefaults } from '@/scheduler/scheduler';
import type { CardInteraction, CardCategory } from '@/types/flashcard';
import type { Attachment } from '@/types/attachment';
import type { CardSpeech } from '@/types/speech';
import { remapAttachmentIds } from '@/utils/attachments';

interface Props {
  deckId: string;
  onNavigate: (r: Route) => void;
}

export function CreateCardPage({ deckId, onNavigate }: Props) {
  async function save({
    front,
    back,
    type,
    interaction,
    attachments,
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
    const ts = Date.now();
    const cardId = uid();

    // Bind every attachment to the freshly minted card id. In the create
    // flow the editor handed us attachments with `cardId === ''` (it had no
    // id to give yet — the contract is "page assigns it at save time").
    const cardAttachments: Attachment[] = attachments.map(a => ({
      ...a,
      cardId,
      updatedAt: ts,
    }));

    // Note: `removedIds` is empty in the create flow by definition (nothing
    // was ever persisted), so we ignore it here.

    // Single transaction: card + attachments commit together or not at all.
    // If something fails halfway, IndexedDB rolls back and the user sees no
    // partial state.
    await db.transaction('rw', db.cards, db.attachments, async () => {
      await db.cards.add({
        id: cardId,
        deckId,
        front,
        back,
        type,
        ...(interaction.kind !== 'classic' ? { interaction } : {}),
        // Only attach the speech record when the user actually configured
        // narration. Omitting the property keeps the row clean for the
        // common case (no narration).
        ...(speech ? { speech } : {}),
        ...newCardDefaults(),
        createdAt: ts,
        updatedAt: ts,
      });
      if (cardAttachments.length > 0) {
        await db.attachments.bulkAdd(cardAttachments);
      }
    });

    onNavigate({ name: 'deck', deckId });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={() => onNavigate({ name: 'deck', deckId })}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-muted hover:bg-card-hover hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> Voltar ao baralho
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Novo cartão</h1>

      <CardEditor
        onSave={save}
        onCancel={() => onNavigate({ name: 'deck', deckId })}
        saveLabel="Criar cartão"
      />
    </div>
  );
}

// `remapAttachmentIds` is imported above for type safety in case future
// changes need to remap ids on create; unused in the current happy path
// because the editor mints ids and the page just binds cardId.
void remapAttachmentIds;
