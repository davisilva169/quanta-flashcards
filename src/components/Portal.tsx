import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  children: ReactNode;
}

/**
 * Portal — escape hatch for modals and floating panels.
 * ============================================================================
 * Renders children into document.body via `createPortal`, sidestepping
 * containing-block issues with `position: fixed`.
 *
 * Why this exists:
 *   `fixed` SHOULD anchor to the viewport. The CSS spec carves out an
 *   exception: if an ancestor has `transform`, `filter`, `perspective`,
 *   `will-change`, or `contain` set, THAT ancestor becomes the containing
 *   block for fixed descendants. Framer Motion components apply inline
 *   `transform` styles for hover/drag animations — so a `<motion.button>`
 *   anywhere in the ancestry can silently break `fixed inset-0` on a modal
 *   underneath it, making the backdrop cover only part of the viewport.
 *
 *   Portals dodge the problem entirely: the modal's DOM node becomes a
 *   direct child of <body>, so there's nothing in its ancestor chain except
 *   <html>. Fixed positioning works exactly as the CSS author expects.
 *
 * SSR safety:
 *   The portal target (document.body) isn't available during server render.
 *   We defer mounting one tick — the first paint returns null, then `mounted`
 *   flips and the portal renders. Quanta is currently desktop-only and the
 *   document exists, but this keeps the component robust for future hosts.
 *
 * Click-to-close, ESC, focus management, etc. don't care where the DOM
 * lives — they use window/document listeners or onClick on the backdrop.
 * Portals don't change React's event bubbling (events still bubble through
 * the React tree), so callbacks on parent components still fire normally.
 * ============================================================================
 */
export function Portal({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
