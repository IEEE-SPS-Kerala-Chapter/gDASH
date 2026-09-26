import { displayFileName } from "./upload-file-name";

/** deck_path is stored as "<user id>/<uuid>-<original filename>" (or, for
 * uploads before per-user folders, "<uuid>-<original filename>") — strip the
 * folder and uuid back off for display. */
export function deckFileName(deckPath: string): string {
  return displayFileName(deckPath);
}
