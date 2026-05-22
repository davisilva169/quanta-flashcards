import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Portal } from './Portal';
import type { Attachment } from '@/types/attachment';
import { useObjectUrl } from '@/utils/attachments';

/**
 * IMAGE LIGHTBOX — bare-bones zoom modal.
 *
 * Same overlay primitives as the rest of the app (Portal + framer-motion +
 * backdrop click closes + Esc closes). NO pan, NO zoom-in-zoom-out, NO
 * carousel — the user already has the image, they just want it bigger.
 *
 * Object URL lifecycle is owned by `useObjectUrl`, which revokes on unmount.
 * Open → mount → URL created. Close → AnimatePresence unmount → URL revoked.
 */
interface Props {
  attachment: Attachment | null;
  onClose: () => void;
}

export function ImageLightbox({ attachment, onClose }: Props) {
  const open = attachment !== null;

  // Esc to close. Body-level listener so it works even if the modal hasn't
  // received focus yet (e.g. opening triggered by a non-focusable img click).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && attachment && (
          <motion.div
            key={attachment.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`Visualização ampliada de ${attachment.filename}`}
            // Heavier backdrop than the confirm modal — we want the image
            // to dominate. `cursor-zoom-out` makes the close affordance
            // discoverable without UI chrome.
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out p-6"
          >
            {/* Close button as escape hatch for users who don't try Esc / outside-click */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute top-4 right-4 rounded-full bg-elevated/80 p-2 text-primary backdrop-blur-sm hover:bg-elevated"
              aria-label="Fechar"
              title="Fechar (Esc)"
            >
              <X size={18} />
            </button>

            <LightboxImage
              attachment={attachment}
              // Stop propagation so clicking the image itself doesn't close.
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function LightboxImage({
  attachment,
  onClick,
}: {
  attachment: Attachment;
  onClick: (e: React.MouseEvent) => void;
}) {
  const url = useObjectUrl(attachment.data);
  return (
    <motion.img
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      src={url ?? undefined}
      alt={attachment.filename}
      onClick={onClick}
      className="max-h-full max-w-full cursor-default rounded-lg shadow-elevated"
    />
  );
}
