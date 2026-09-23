/**
 * Uploads are stored as `<uuid>-<original name>` so two files with the same
 * name never collide. When a draft is restored, only that storage path is
 * known — strip the uuid back off so the participant sees their own file
 * name, not a random-looking prefix.
 */
export function displayFileName(storagePath: string): string {
  const name = storagePath.split("/").pop() ?? storagePath;
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
}
