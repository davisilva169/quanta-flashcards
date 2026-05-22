/**
 * A folder groups decks. Folders are flat (no nesting) for simplicity in the
 * MVP — sub-folders can be added later by promoting `parentId` to a real
 * field (kept out for now to avoid recursive UI work).
 *
 * `colorKey` accepts a CSS hex string ("#a78bfa") or a legacy preset key
 * ("violet", "cyan", ...). The `resolveColor` helper makes consumers
 * agnostic to the storage form.
 */
export interface Folder {
  id: string;
  name: string;
  description?: string;
  /** Hex color ("#a78bfa") or legacy preset name. See utils/folderColors.ts. */
  colorKey: string;
  createdAt: number;
  updatedAt: number;
}
