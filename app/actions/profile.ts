"use server";

import { createClient } from "@/lib/supabase/server";

export type MyProfile = {
  role: "super_admin" | "admin" | "judge" | "volunteer" | string;
  fullName: string;
  mustResetPassword: boolean;
};

/** The signed-in staff member's own role + name, for branching dashboard UI by role. */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, must_reset_password")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return { role: profile.role, fullName: profile.full_name, mustResetPassword: profile.must_reset_password };
}
