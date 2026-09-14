/** Shared by both the leader (team.ts) and additional-member (member.ts)
 * schemas, so there's one canonical role list instead of two that could
 * drift apart. "Other" reveals a free-text field in the UI. */
export const TEAM_ROLES = [
  "Team Leader",
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
