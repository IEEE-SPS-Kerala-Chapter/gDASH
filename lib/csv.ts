/**
 * One CSV field, shared by the registrations and attendance exports.
 *
 * Values that start with = + - @ (or a tab/carriage return) are prefixed
 * with an apostrophe: spreadsheet apps would otherwise run them as formulas
 * when an organiser opens the export — and team names, member names etc.
 * are typed by participants ("CSV injection").
 */
export function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
