import { motion } from 'framer-motion';
import { Layers, ArrowUpRight, AlertCircle } from 'lucide-react';
import type { Deck } from '@/types/deck';
import type { DeckProgress } from '@/utils/stats';
import { resolveColor, withAlpha } from '@/utils/folderColors';

interface Props {
  deck: Deck;
  progress: DeckProgress;
  onOpen: () => void;
  /**
   * If true, the card is draggable. The DnD handlers should be wired by the
   * parent — the card just becomes a drag source.
   */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Visual feedback while this specific card is being dragged. */
  isDragging?: boolean;
}

export function DeckCard({
  deck,
  progress,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging,
}: Props) {
  const ratio = progress.total === 0 ? 0 : progress.maduros / progress.total;
  const color = resolveColor(deck.colorKey);

  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onOpen}
      draggable={draggable}
      // Framer Motion's motion.button overrides onDragStart / onDragEnd with
      // its own gesture API. We want plain HTML5 drag-and-drop here, so we
      // cast through `any` to keep the React DragEvent signature.
      onDragStart={onDragStart as unknown as undefined}
      onDragEnd={onDragEnd as unknown as undefined}
      animate={{ opacity: isDragging ? 0.4 : 1 }}
      className={`group relative text-left p-5 rounded-xl border border-subtle bg-card shadow-soft hover:border-accent/40 transition-colors overflow-hidden ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {/* Faint accent wash on hover — accent token at low opacity, themes itself. */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-accent/[0.06] to-transparent pointer-events-none" />

      <div className="flex items-start justify-between gap-3 mb-3 relative">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ backgroundColor: withAlpha(color.hex, 0.12) }}
          >
            <Layers size={15} style={{ color: color.hex }} />
          </div>
          <div>
            <h3 className="font-medium tracking-tight text-primary">
              {deck.name}
            </h3>
          </div>
        </div>
        <ArrowUpRight
          size={16}
          className="text-muted group-hover:text-accent-fg transition-colors"
        />
      </div>

      {deck.description && (
        <p className="text-sm text-muted line-clamp-2 leading-relaxed mb-4 relative">
          {deck.description}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 text-xs relative">
        <Stat label="Cartões" value={progress.total} />
        <Stat
          label="Vencidos"
          value={progress.vencidos}
          accent={progress.vencidos > 0}
        />
        <Stat label="Maduros" value={`${Math.round(ratio * 100)}%`} />
      </div>

      {progress.atrasados > 0 && (
        <div className="mt-3 flex items-center gap-1 text-[11px] text-warning-fg relative">
          <AlertCircle size={11} />
          {progress.atrasados} atrasado{progress.atrasados > 1 ? 's' : ''}
        </div>
      )}

      <div className="mt-4 h-1 w-full rounded-full tint-2 overflow-hidden relative">
        <div
          className="h-full bg-accent"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </motion.button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </div>
      {accent ? (
        // Pill background — the bare colored number was too washed out in the
        // light theme. With a tinted fill it reads as a real status badge.
        <div className="mt-0.5 inline-flex rounded-md bg-warning-soft px-1.5 py-0.5 text-base font-semibold text-warning-fg">
          {value}
        </div>
      ) : (
        <div className="mt-0.5 text-base font-medium text-primary">
          {value}
        </div>
      )}
    </div>
  );
}
