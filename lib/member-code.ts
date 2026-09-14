/** Presentational-only short code shown on ID cards etc — never used for
 * lookup (the QR payload and `/id/[memberId]` route always use the full
 * `team_members.id` UUID). Mirrors the existing `lib/team-code.ts` pattern. */
export function memberDisplayCode(memberId: string): string {
  return `GIG-${memberId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
