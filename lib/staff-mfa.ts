import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Staff 2FA helpers. A password-only staff session is "aal1"; after the
 * authenticator-app code it's "aal2". Every staff power requires aal2 —
 * enforced in the database (supabase/migrations/20261006000000_staff_mfa.sql)
 * and in the server checks (getCallerRole, getMyProfile).
 */

/** True when the current session has passed the authenticator-app code. */
export async function sessionIsAal2(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.currentLevel === "aal2";
}

/** True when the user has a confirmed authenticator app. */
export function hasVerifiedTotp(user: Pick<User, "factors">): boolean {
  return (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}
