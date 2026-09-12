import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/admin/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  // RLS is the real backstop (staff-only SELECT policies on teams/team_members/
  // registrations) — this redirect is just so a non-staff account sees a clean
  // bounce instead of an empty/broken dashboard.
  if (!profile || !["admin", "judge", "volunteer"].includes(profile.role)) {
    redirect("/");
  }

  return (
    <DashboardShell role={profile.role} name={profile.full_name}>
      {children}
    </DashboardShell>
  );
}
