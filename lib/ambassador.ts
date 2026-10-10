/**
 * Ambassador referral IDs: AMGIG-00 … AMGIG-<last number>. The database
 * stores only the number (registrations.ambassador_number, null = no
 * ambassador referred); this is the one place that formats and parses it.
 * See supabase/migrations/20261003000000_ambassador_referrals.sql.
 */

/** Form value for "No ambassador referred". */
export const NO_AMBASSADOR = "none";
export const NO_AMBASSADOR_LABEL = "No ambassador referred";

export function formatAmbassadorId(n: number): string {
  return `AMGIG-${String(n).padStart(2, "0")}`;
}

/** "7", "07", "AMGIG-07", "amgig 7" → 7; anything else → null. */
export function parseAmbassadorInput(input: string): number | null {
  const match = input.trim().match(/^(?:amgig[\s-]*)?(\d{1,3})$/i);
  return match ? Number(match[1]) : null;
}

/** Every number in the range, 0 … lastNumber (empty when no range is set). */
export function ambassadorNumbers(lastNumber: number | null): number[] {
  if (lastNumber === null || lastNumber < 0) return [];
  return Array.from({ length: lastNumber + 1 }, (_, i) => i);
}

/** Form value ("none" or a number as text) → what the database stores. */
export function ambassadorFormValueToNumber(value: string): number | null {
  if (!value || value === NO_AMBASSADOR) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function ambassadorLabel(n: number | null): string {
  return n === null ? NO_AMBASSADOR_LABEL : formatAmbassadorId(n);
}

/**
 * Name and college the super-admin entered for an ID (either may be
 * missing). A deleted ID can't be picked on the registration form.
 */
export type AmbassadorDetail = { name: string | null; college: string | null; deleted?: boolean };
/** Details by ambassador number; IDs without any are simply absent. */
export type AmbassadorDetails = Record<number, AmbassadorDetail>;

/** "AMGIG-07 · Anu Joseph · FISAT" — the ID plus whatever details are set. */
export function ambassadorDisplay(n: number | null, details?: AmbassadorDetails): string {
  if (n === null) return NO_AMBASSADOR_LABEL;
  const d = details?.[n];
  return [formatAmbassadorId(n), d?.name, d?.college].filter(Boolean).join(" · ");
}

/** The IDs participants can still pick: the range minus deleted ones. */
export function selectableAmbassadorNumbers(lastNumber: number | null, details?: AmbassadorDetails): number[] {
  return ambassadorNumbers(lastNumber).filter((n) => !details?.[n]?.deleted);
}

/**
 * The range to offer on the registration form: null (question hidden) when
 * there is no range, or every ID in it has been deleted.
 */
export function effectiveAmbassadorRange(lastNumber: number | null, details?: AmbassadorDetails): number | null {
  return selectableAmbassadorNumbers(lastNumber, details).length > 0 ? lastNumber : null;
}
