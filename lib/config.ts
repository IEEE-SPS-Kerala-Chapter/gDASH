// Leader email verification, gated before /register. The leader proves
// they own their email either via Google OAuth or a Supabase email magic
// link — both land the same authenticated session, so everything
// downstream (registration.ts, step-team.tsx) only cares that a session
// exists, not which provider produced it. See googleOauth.md for the
// Google Cloud Console + Supabase dashboard setup Google sign-in depends
// on; the email magic link needs no extra setup beyond Supabase's default
// Email provider, already on.
export const LEADER_VERIFICATION_ENABLED = true;
