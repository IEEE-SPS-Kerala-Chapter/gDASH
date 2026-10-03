import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { sessionIsAal2 } from "@/lib/staff-mfa";

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
    .select("role, full_name, must_reset_password")
    .eq("id", user.id)
    .single();

  // RLS is the real backstop (staff-only SELECT policies on teams/team_members/
  // registrations) — this redirect is just so a non-staff account sees a clean
  // bounce instead of an empty/broken dashboard.
  if (!profile || !["admin", "judge", "volunteer", "super_admin"].includes(profile.role)) {
    redirect("/");
  }

  // Single gate for everything under /dashboard — a staff member who hasn't
  // reset their (admin-chosen, once-plaintext) initial password yet gets
  // bounced to do that first. /reset-password is a sibling route, not
  // nested under /dashboard, so it isn't itself subject to this check.
  if (profile.must_reset_password) {
    redirect("/reset-password");
  }

  // Then 2FA: set up an authenticator app (first time) or enter its code.
  // Every staff power needs this — the database refuses a password-only
  // session regardless (supabase/migrations/20261006000000_staff_mfa.sql).
  if (!(await sessionIsAal2(supabase))) {
    redirect("/login/2fa");
  }

  return (
    <DashboardShell role={profile.role} name={profile.full_name}>
      {children}
    </DashboardShell>
  );
}
