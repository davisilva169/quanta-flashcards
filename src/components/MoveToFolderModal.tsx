import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder as FolderIcon, FolderX, X } from 'lucide-react';
import type { Folder } from '@/types/folder';
import { db } from '@/db/database';
import { resolveColor, withAlpha } from '@/utils/folderColors';
import { Portal } from './Portal';

interface MoveToFolderModalProps {
  open: boolean;
  currentFolderId: string | null;
  onClose: () => void;
  onPick: (folderId: string | null) => void;
}

/**
 * Folder picker modal. Overlay is `bg-black/70` in both themes (correct
 * backdrop treatment). Panel is the solid `bg-elevated` token. The active
 * row uses `bg-accent-soft` + `text-accent-fg` — theme-aware accent tint.
 */
export function MoveToFolderModal({
  open,
  currentFolderId,
  onClose,
  onPick,
}: MoveToFolderModalProps) {
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    if (!open) return;
    db.folders.orderBy('name').toArray().then(setFolders);
  }, [open]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-elevated shadow-elevated"
          >
            <div className="flex items-center justify-between border-b border-divider p-4">
              <div className="font-medium text-primary">Mover para pasta</div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-muted hover:tint-2 hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 space-y-1 overflow-y-auto p-2">
              <button
                onClick={() => onPick(null)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  currentFolderId === null
                    ? 'bg-accent-soft text-accent-fg'
                    : 'text-secondary hover:tint-1'
                }`}
              >
                <div className="rounded-md tint-2 p-2">
                  <FolderX className="h-4 w-4 text-muted" />
                </div>
                <div className="flex-1">
                  <div className="text-sm">Sem pasta</div>
                  <div className="text-[11px] text-faint">
                    Baralho fica solto
                  </div>
                </div>
                {currentFolderId === null && (
                  <span className="text-[10px] uppercase tracking-wide text-accent-fg">
                    atual
                  </span>
                )}
              </button>

              {folders.map(f => {
                const color = resolveColor(f.colorKey);
                const active = currentFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => onPick(f.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent-fg'
                        : 'text-secondary hover:tint-1'
                    }`}
                  >
                    <div
                      className="rounded-md p-2"
                      style={{ backgroundColor: withAlpha(color.hex, 0.12) }}
                    >
                      <FolderIcon
                        className="h-4 w-4"
                        style={{ color: color.hex }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">{f.name}</div>
                      {f.description && (
                        <div className="text-[11px] text-faint line-clamp-1">
                          {f.description}
                        </div>
                      )}
                    </div>
                    {active && (
                      <span className="text-[10px] uppercase tracking-wide text-accent-fg">
                        atual
                      </span>
                    )}
                  </button>
                );
              })}

              {folders.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-faint">
                  Nenhuma pasta criada ainda.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
