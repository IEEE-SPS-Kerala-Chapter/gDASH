// Leader email verification, gated before /register. The leader proves
// they own their email either via Google OAuth or a sign-in code Supabase
// emails them — both land the same authenticated session, so everything
// downstream (registration.ts, step-team.tsx) only cares that a session
// exists, not which provider produced it. See googleOauth.md for the
// Google Cloud Console + Supabase dashboard setup Google sign-in depends
// on, and smtpSetup.md for sending the email codes through the Workspace
// Gmail mailbox and the email templates that show the code.
export const LEADER_VERIFICATION_ENABLED = true;

// Shared across step-declarations.tsx (inline next to the rules checkbox)
// and registration-wizard.tsx (a persistent link on every other step) —
// one place to update if this ever moves.
export const RULES_URL = "/gignite-rules.pdf";

// The official pitch deck template — linked from the registration form's
// idea step and from the correction email.
export const DECK_TEMPLATE_URL =
  "https://docs.google.com/presentation/d/131gSVctKwqtEYeG9JiWsmXSEDMM98I4F/edit?slide=id.p1#slide=id.p1";

// Google Form where a team sends corrected details after verification finds
// a problem — linked from the "Correction required" email (sent when a
// volunteer or admin marks a team "needs correction"). Leave empty to ask
// them to reply to the email instead.
export const CORRECTION_FORM_URL = "https://forms.gle/DiK5aBxSERSJ4xPT9";

// Days a team has to send corrected details, counted from when the
// correction email is sent. The email says "within N days of this email";
// staff screens show the due date and when it's overdue, so an admin can
// mark the team ineligible.
export const CORRECTION_DEADLINE_DAYS: number = 3;
