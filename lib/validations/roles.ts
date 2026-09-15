/** Shared by additional-member schemas (member.ts) — the leader no longer
 * picks a role here (they're already marked as leader), so "Team Leader"
 * isn't a selectable option for anyone. "Other" reveals a free-text field
 * in the UI. */
export const TEAM_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "ML/AI Engineer",
  "UI/UX Designer",
  "Data Engineer",
  "DevOps Engineer",
  "Other",
] as const;

export const OTHER_ROLE = "Other" as const;
