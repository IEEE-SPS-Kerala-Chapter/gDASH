"use server";

import { createClient } from "@/lib/supabase/server";
import { sessionIsAal2 } from "@/lib/staff-mfa";

export type MyProfile = {
  role: "super_admin" | "admin" | "judge" | "volunteer" | string;
  fullName: string;
  mustResetPassword: boolean;
};

/**
 * The signed-in staff member's own role + name, for branching dashboard UI
 * by role. Null until the session has passed the 2FA code (aal2).
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await sessionIsAal2(supabase))) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, must_reset_password")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return { role: profile.role, fullName: profile.full_name, mustResetPassword: profile.must_reset_password };
}
