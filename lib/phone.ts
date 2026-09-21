/**
 * Normalizes a phone number for duplicate comparison: strips everything but
 * digits, then drops a leading "91" country code when that leaves exactly a
 * 10-digit number — so "+919876543210", "919876543210" and "9876543210"
 * all compare equal.
 *
 * Mirrors normalize_phone() in
 * supabase/migrations/20260921000000_phone_duplicate_and_live_check.sql —
 * keep both in sync if this logic ever changes.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}
