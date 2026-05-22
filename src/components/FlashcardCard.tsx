import { motion } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import type { Flashcard } from '@/types/flashcard';
import { getCategoryLabel } from '@/types/flashcard';
import type { Attachment } from '@/types/attachment';
import { LatexMarkdown } from './LatexMarkdown';
import { formatRelative } from '@/utils/dates';

interface Props {
  card: Flashcard;
  onEdit: () => void;
  onDelete: () => void;
  /** Attachments belonging to THIS card. Optional — when omitted, marker
   *  references render as "imagem ausente". */
  attachments?: Attachment[];
}

const STATE_LABELS: Record<string, string> = {
  new: 'Novo',
  learning: 'Aprendendo',
  review: 'Revisão',
  relearning: 'Reaprendendo',
};

export function FlashcardCard({ card, onEdit, onDelete, attachments }: Props) {
  return (
    // Animação de entrada: APENAS opacity, sem translate.
    //
    // Histórico desse trade-off: um `y: 6` inicial criaria um fade
    // "subindo" mais agradável visualmente, MAS numa página com vários
    // cartões (DeckPage com 15+ cartões), todos com `transform:
    // translateY(6px)` simultâneo durante o mount inflam o scrollHeight
    // do `<main>` em Chromium/Electron. O `<main>` decide mostrar
    // scrollbar baseado nesse scrollHeight inflado e fica "preso" em
    // estado scrollável mesmo depois da animação acabar — o usuário
    // consegue rolar pra baixo do último cartão e vê um espaço vazio.
    //
    // Mesmo bug, mesma cura, da Fase 1.5 no keyframe `fadeIn` do
    // tailwind.config.js. Aqui é o framer-motion direto. Solução:
    // opacity-only. O cartão aparece, com um leve fade — clean.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-subtle bg-card p-4 hover:border-divider transition-colors overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest bg-accent-soft text-accent-fg border border-accent/20">
          {getCategoryLabel(card.type)}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted">
          {STATE_LABELS[card.state] || card.state}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted">
          · vence {formatRelative(card.due)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:tint-1 text-muted hover:text-primary transition-colors"
            title="Editar"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-danger-soft text-muted hover:text-danger-fg transition-colors"
            title="Deletar"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/*
        `min-w-0` on each grid child prevents a wide KaTeX expression
        from forcing its column past the available width. Without it the
        whole layout could overflow horizontally — see Layout.tsx note.
      */}
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
            Frente
          </div>
          <div className="max-h-32 overflow-hidden text-sm">
            <LatexMarkdown content={card.front} attachments={attachments} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
            Verso
          </div>
          <div className="max-h-32 overflow-hidden text-sm">
            <LatexMarkdown content={card.back} attachments={attachments} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
