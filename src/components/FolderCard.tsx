import { Folder as FolderIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Folder } from '@/types/folder';
import { resolveColor, withAlpha } from '@/utils/folderColors';

interface FolderCardProps {
  folder: Folder;
  deckCount: number;
  totalCards: number;
  dueCount: number;
  onClick: () => void;
  /** When true, this card is the active drop target (deck being dragged over it). */
  isDropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * Visual rule:
 *   - Border + icon use the folder's color.
 *   - Background stays the standard `bg-card` surface (themes automatically).
 *   - Name is always `text-primary`, never tinted with the folder color —
 *     tinted names were harder to scan.
 */
export function FolderCard({
  folder,
  deckCount,
  totalCards,
  dueCount,
  onClick,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderCardProps) {
  const color = resolveColor(folder.colorKey);

  // When a deck is dragged over, beef up the border and add a faint tint of
  // the folder color to signal "drop here".
  const borderColor = isDropTarget ? color.hex : withAlpha(color.hex, 0.4);
  const bgColor = isDropTarget ? withAlpha(color.hex, 0.08) : 'transparent';
  const borderWidth = isDropTarget ? 2 : 1;

  return (
    <motion.button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="group flex w-full flex-col gap-3 rounded-xl border border-subtle bg-card p-4 text-left shadow-soft transition-colors"
      style={{
        borderStyle: 'solid',
        borderWidth,
        borderColor,
        backgroundColor: bgColor === 'transparent' ? undefined : bgColor,
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: withAlpha(color.hex, 0.12) }}
        >
          <FolderIcon className="h-5 w-5" style={{ color: color.hex }} />
        </div>
        {dueCount > 0 && (
          <span className="rounded-full bg-warning-soft border border-warning/30 px-2 py-0.5 text-[11px] font-semibold text-warning-fg">
            {dueCount} {dueCount === 1 ? 'vencido' : 'vencidos'}
          </span>
        )}
      </div>
      <div>
        <div className="text-base font-semibold text-primary">
          {folder.name}
        </div>
        {folder.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted">
            {folder.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted">
        <span>
          {deckCount} baralho{deckCount === 1 ? '' : 's'}
        </span>
        <span>{totalCards} cartões</span>
      </div>
    </motion.button>
  );
}
