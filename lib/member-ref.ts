const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Member codes are "<team entry code>-<member no>", e.g. GIG-7K3QPA-1
// (supabase/migrations/20260924010000_member_codes.sql).
const MEMBER_CODE_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/i;

/**
 * Turns what a scanner read (or a volunteer typed) into what scan_member()
 * accepts: a member id or a member code. ID-card QR codes encode
 * `<site>/id/<memberId>` on whichever domain generated the card, so any
 * host is accepted as long as the path is /id/<uuid>. Returns null for
 * anything else (e.g. a random QR code).
 */
export function parseMemberRef(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const match = new URL(value).pathname.match(/^\/id\/([^/]+)\/?$/);
      return match && UUID_RE.test(match[1]) && match[1].length === 36 ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }
  if (value.length === 36 && UUID_RE.test(value)) return value.toLowerCase();
  if (MEMBER_CODE_RE.test(value)) return value.toUpperCase();
  return null;
}
