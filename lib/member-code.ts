/** Presentational-only short code shown on ID cards etc — never used for
 * lookup (the QR payload and `/id/[memberId]` route always use the full
 * `team_members.id` UUID). Unlike teams.entry_code, this one is still just
 * derived from the UUID, not checked for uniqueness against other members. */
export function memberDisplayCode(memberId: string): string {
  return `GIG-${memberId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
