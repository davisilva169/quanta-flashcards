export interface Deck {
  id: string;
  /**
   * The folder this deck lives in. `null` means the deck is "loose" (shown
   * directly under the decks page root).
   */
  folderId: string | null;
  name: string;
  description: string;
  /** CSS hex color ("#a78bfa") or a legacy preset key. See utils/folderColors.ts. */
  colorKey?: string;
  createdAt: number;
  updatedAt: number;
}
