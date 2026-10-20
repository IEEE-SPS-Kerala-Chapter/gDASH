import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Staff 2FA helpers. A password-only staff session is "aal1"; after the
 * authenticator-app code it's "aal2". 2FA is optional except for the
 * super-admin: someone with an authenticator app must enter its code, and
 * someone without one gets in with the password — the same rule the
 * database applies (staff_mfa_ok() in
 * supabase/migrations/20261022000000_optional_staff_mfa.sql), mirrored in
 * the server checks (getCallerRole, getMyProfile, the dashboard layout).
 */

/** Roles that must use 2FA; everyone else may choose. */
export const MFA_REQUIRED_ROLES: readonly string[] = ["super_admin"];

export type MfaState = {
  /** Has a confirmed authenticator app. */
  enrolled: boolean;
  /** This session has passed the code. */
  verified: boolean;
};

export async function getMfaState(supabase: SupabaseClient): Promise<MfaState | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  // nextLevel is aal2 exactly when the user has a verified factor.
  return { enrolled: data.nextLevel === "aal2", verified: data.currentLevel === "aal2" };
}

/** Whether a staff session with this role may use staff powers. */
export function mfaSatisfied(state: MfaState | null, role: string): boolean {
  if (!state) return false;
  if (state.verified) return true;
  return !state.enrolled && !MFA_REQUIRED_ROLES.includes(role);
}

/** True when the current session has passed the authenticator-app code. */
export async function sessionIsAal2(supabase: SupabaseClient): Promise<boolean> {
  return (await getMfaState(supabase))?.verified ?? false;
}

/** True when the user has a confirmed authenticator app. */
export function hasVerifiedTotp(user: Pick<User, "factors">): boolean {
  return (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}
