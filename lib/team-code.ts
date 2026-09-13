/**
 * Short, presentational "entry code" for a team — display-only, derived
 * from the team's UUID, never stored. There's no dedicated short-code
 * column in the schema; adding one wasn't worth a migration just for a
 * label in the team detail header/record panel.
 */
export function teamDisplayCode(teamId: string): string {
  return "GIG-" + teamId.replace(/-/g, "").slice(0, 4).toUpperCase();
}
