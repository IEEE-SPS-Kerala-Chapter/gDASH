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
