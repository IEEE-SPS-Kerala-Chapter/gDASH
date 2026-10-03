"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffLoginSchema, resetPasswordSchema } from "@/lib/validations/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { LOCKED_MESSAGE, clientIp, minutesUntil } from "@/lib/staff-lockout";

type SignInResult = { success: true } | { success: false; error: string };

/**
 * Staff (admin/judge/volunteer/super-admin) email+password sign-in.
 *
 * Lockout: 5 failed attempts for an email (or 20 from one IP) within an
 * hour lock sign-in for 1 hour — see
 * supabase/migrations/20261001000000_staff_login_lockout.sql. Counted for
 * any email typed, so the response never reveals which emails are staff
 * accounts. If the lockout check itself can't run, sign-in is refused
 * rather than allowed unchecked.
 */
export async function signIn(data: { email: string; password: string }): Promise<SignInResult> {
  const parsed = staffLoginSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email and password." };
  }
  const { email } = parsed.data;
  const ip = await clientIp();
  const admin = createAdminClient();

  const { data: status, error: statusError } = await admin.rpc("staff_login_status", { p_email: email, p_ip: ip });
  if (statusError || !status) {
    console.error("staff_login_status failed:", statusError);
    return { success: false, error: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  const before = status as { locked: boolean; locked_until: string | null };
  if (before.locked && before.locked_until) {
    return { success: false, error: LOCKED_MESSAGE(minutesUntil(before.locked_until)) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  await admin.rpc("staff_login_record", { p_email: email, p_ip: ip, p_succeeded: !error });

  if (error) {
    // This failure may have been the 5th — say so straight away.
    const { data: after } = await admin.rpc("staff_login_status", { p_email: email, p_ip: ip });
    const now = after as { locked: boolean; locked_until: string | null; email_failures: number } | null;
    if (now?.locked && now.locked_until) {
      return { success: false, error: LOCKED_MESSAGE(minutesUntil(now.locked_until)) };
    }
    const left = now ? Math.max(0, 5 - now.email_failures) : null;
    return {
      success: false,
      error:
        left !== null && left <= 2
          ? `Incorrect email or password. ${left} attempt${left === 1 ? "" : "s"} left before sign-in is locked for 1 hour.`
          : "Incorrect email or password.",
    };
  }
  await logAuditEvent(supabase, "auth.signed_in");
  return { success: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

type ResetOwnPasswordResult = { success: true } | { success: false; error: string };

/**
 * Self-service password reset for a signed-in staff member (forced on first
 * login — see dashboard/layout.tsx). Two separate steps, deliberately using
 * two different clients:
 *
 * 1. `auth.updateUser({password})` on the normal session client — Supabase
 *    guarantees this only ever touches the caller's own auth.users row, so
 *    it's safe as a self-service call.
 * 2. Flip `must_reset_password` to false via the SERVICE-ROLE client, with a
 *    literal field object (never a spread of client input). This does NOT
 *    go through the `profiles_update_own` RLS policy on purpose: that
 *    policy is row-scoped (`id = auth.uid()`) but has no column-level
 *    restriction, so a self-service update through the normal client could
 *    in theory also alter `role` in the same call. Using service-role with
 *    a hardcoded field sidesteps that gap entirely rather than relying on
 *    it — the gap itself is a pre-existing issue, flagged for a future fix,
 *    not touched here.
 */
export async function resetOwnPassword(input: { newPassword: string; confirmPassword: string }): Promise<ResetOwnPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You need to be signed in." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateError) {
    return { success: false, error: updateError.message || "Could not update password." };
  }

  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_reset_password: false })
    .eq("id", user.id);
  if (flagError) {
    // Password did change — this only failed to clear the flag, so surface
    // it distinctly rather than implying the whole reset failed.
    return { success: false, error: "Password updated, but couldn't clear the reset flag. Contact an admin." };
  }

  await logAuditEvent(supabase, "auth.password_reset");
  return { success: true };
}
