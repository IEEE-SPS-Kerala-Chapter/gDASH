"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffLoginSchema, resetPasswordSchema } from "@/lib/validations/auth";

type SignInResult = { success: true } | { success: false; error: string };

/** Staff (admin/judge/volunteer) email+password sign-in. */
export async function signIn(data: { email: string; password: string }): Promise<SignInResult> {
  const parsed = staffLoginSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: "Incorrect email or password." };
  }
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

  return { success: true };
}
