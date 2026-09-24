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
export const RULES_URL = "https://docs.google.com/document/d/1KF-yekcP4ZKF40_f_7cH_JkEJniD6KtcvNObSt2_pSc/edit?usp=sharing";
