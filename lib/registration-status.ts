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
  submitted: "Entry received. Verify eligibility, then assign judges.",
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
  submitted: { bg: "var(--ig-status-submitted-bg)", fg: "var(--ig-status-submitted-fg)", dot: "var(--ig-status-submitted-dot)" },
  under_review: { bg: "var(--ig-status-under_review-bg)", fg: "var(--ig-status-under_review-fg)", dot: "var(--ig-status-under_review-dot)" },
  shortlisted: { bg: "var(--ig-status-shortlisted-bg)", fg: "var(--ig-status-shortlisted-fg)", dot: "var(--ig-status-shortlisted-dot)" },
  rejected: { bg: "var(--ig-status-rejected-bg)", fg: "var(--ig-status-rejected-fg)", dot: "var(--ig-status-rejected-dot)" },
};

/** Admin eligibility check, separate from the judging status above — see
 * supabase/migrations/20260923030000_registration_verification.sql. */
export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending verification",
  verified: "Verified",
  needs_correction: "Correction requested",
  ineligible: "Ineligible",
};

export const VERIFICATION_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  pending: "warn",
  verified: "success",
  needs_correction: "neutral",
  ineligible: "danger",
};

export const VERIFICATION_STATUS_HINTS: Record<string, string> = {
  pending: "Check every member's college ID card, details and pitch deck before this entry can be assigned to judges.",
  verified: "Participants checked and eligible. This entry can be assigned to judges.",
  needs_correction:
    "The team leader was emailed what to fix and asked to send corrected details. Mark verified once they're fixed; if the deadline passes with no reply, an admin can mark the team ineligible.",
  ineligible: "Final: the team can't move forward and the leader was told why. This entry can't be assigned to judges.",
};
