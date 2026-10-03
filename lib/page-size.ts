/**
 * Rows per page for the dashboard team lists: 30, or ?pageSize=N (1–100)
 * in the URL — handy for testing scrolling with few teams. A plain module
 * (not "use client"), because the dashboard page calls it on the server.
 */
export function pageSizeFrom(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 30;
}
