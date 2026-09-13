/** deck_path is stored as "<uuid>-<original filename>" (see step-idea.tsx's
 * upload handler) — strip the uuid prefix back off for display. */
export function deckFileName(deckPath: string): string {
  return deckPath.replace(/^[0-9a-fA-F-]{36}-/, "");
}
