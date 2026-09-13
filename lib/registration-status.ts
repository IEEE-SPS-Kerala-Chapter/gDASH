import type { BadgeVariant } from "@/components/admin/ui";

/** Single source of truth for registration status labels/colors — was
 * previously duplicated across teams-browser, team-detail, and
 * inline-status-select with slightly different color choices each time. */
export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
};

export const REGISTRATION_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  submitted: "neutral",
  under_review: "warn",
  shortlisted: "success",
  rejected: "danger",
};

/** What each status means, shown as a hint under the status selector on the team detail page. */
export const REGISTRATION_STATUS_HINTS: Record<string, string> = {
  submitted: "Entry received and eligible. Awaiting judge scores.",
  under_review: "Assigned judges are scoring. Status changes are held until all scores are in.",
  shortlisted: "Through to the 24-hour Grand Finale at FISAT. The leader is notified by email.",
  rejected: "Not advancing. The leader receives the panel's written comments.",
};

/**
 * Exact colors for the large dot-badge on the team detail header — per the
 * Claude Design file (gIGNITE Team Detail Page.dc.html). Deliberately not
 * reusing the compact Badge's success/warn/danger tones: that design makes
 * "Rejected" a muted neutral tone rather than alarming red (a rejection is
 * an outcome, not an error), which the generic Badge variants don't cover.
 */
export const REGISTRATION_STATUS_PILL: Record<string, { bg: string; fg: string; dot: string }> = {
  submitted: { bg: "#E4EAF6", fg: "#20419A", dot: "#20419A" },
  under_review: { bg: "#FDE9D8", fg: "#96430B", dot: "#F27721" },
  shortlisted: { bg: "#DFEDE6", fg: "#146443", dot: "#16794F" },
  rejected: { bg: "#EFE4CB", fg: "#6B6355", dot: "#9A9184" },
};
