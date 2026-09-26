/**
 * Storage paths for participant uploads (registration-decks, member-id-cards):
 * `<uploader's user id>/<uuid>-<original file name>`.
 *
 * The folder is what the storage insert policy checks
 * (20260927000000_storage_uploads_require_owner.sql): a signed-in user can
 * only write into their own folder. Actual ownership — who uploaded a file —
 * is verified against Storage's own record by the owns_upload() database
 * function (20260927010000_verify_upload_ownership.sql), never by the path.
 */
export function buildUploadPath(userId: string, fileName: string): string {
  // Storage keys can't hold "/" in a name; strip control characters too.
  const safeName = fileName.replace(/[/\\\u0000-\u001f]/g, "_");
  return `${userId}/${crypto.randomUUID()}-${safeName}`;
}

/**
 * Uploads from before per-user folders (`<uuid>-<name>`, no "/") were made
 * without a session, so they have no recorded owner and can't be used any
 * more — drafts drop them and the leader uploads again.
 */
export function isLegacyUploadPath(path: string): boolean {
  return Boolean(path) && !path.includes("/");
}
