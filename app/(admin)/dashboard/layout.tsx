import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { getMfaState, mfaSatisfied } from "@/lib/staff-mfa";

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
    .select("role, full_name, must_reset_password, mfa_skipped_at")
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

  // Then 2FA (lib/staff-mfa.ts): enter the code if there's an authenticator
  // app; the super-admin must set one up; anyone else who hasn't chosen yet
  // is asked once whether to set it up or skip. The database applies the
  // same rule regardless (20261022000000_optional_staff_mfa.sql).
  const mfa = await getMfaState(supabase);
  const owesCode = !mfaSatisfied(mfa, profile.role);
  const notChosenYet = !mfa?.enrolled && !profile.mfa_skipped_at;
  if (owesCode || notChosenYet) {
    redirect("/login/2fa");
  }

  // Admins' "Export finale shortlist" is enabled once results are published.
  let resultsPublished = false;
  if (["admin", "super_admin"].includes(profile.role)) {
    const { data: publication } = await supabase.from("results_publication").select("is_published").eq("id", true).maybeSingle();
    resultsPublished = Boolean(publication?.is_published);
  }

  return (
    <DashboardShell role={profile.role} name={profile.full_name} resultsPublished={resultsPublished}>
      {children}
    </DashboardShell>
  );
}
