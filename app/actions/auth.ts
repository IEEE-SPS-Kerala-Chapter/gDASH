"use server";

import { createClient } from "@/lib/supabase/server";
import { staffLoginSchema } from "@/lib/validations/auth";

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
