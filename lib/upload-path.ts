/**
 * Storage paths for participant uploads (registration-decks, member-id-cards):
 * `<uploader's user id>/<uuid>-<original file name>`.
 *
 * The folder is what the storage insert policy checks
 * (20260927000000_storage_uploads_require_owner.sql): a signed-in user can
 * only write into their own folder. Files uploaded before that change have
 * no folder (`<uuid>-<name>`); they're still accepted so drafts saved
 * earlier keep working, and are protected only by their unguessable uuid.
 */
export function buildUploadPath(userId: string, fileName: string): string {
  // Storage keys can't hold "/" in a name; strip control characters too.
  const safeName = fileName.replace(/[/\\\u0000-\u001f]/g, "_");
  return `${userId}/${crypto.randomUUID()}-${safeName}`;
}

/** True when `path` is `userId`'s own upload, or a pre-folder legacy path. */
export function isOwnOrLegacyUploadPath(path: string, userId: string): boolean {
  if (!path || path.includes("..")) return false;
  const slash = path.indexOf("/");
  if (slash === -1) return true; // legacy, pre-folder upload
  return path.slice(0, slash) === userId && !path.slice(slash + 1).includes("/");
}
