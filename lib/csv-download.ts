/** Triggers a browser download of CSV text — shared by the teams list's
 * "Export CSV" button and the sidebar's Export nav item, so both keep the
 * exact same blob/object-URL dance instead of two copies drifting apart. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
