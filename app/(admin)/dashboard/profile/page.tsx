import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMfaState, MFA_REQUIRED_ROLES } from "@/lib/staff-mfa";
import { roleLabel } from "@/lib/roles";
import { PageHeading, Panel, SectionLabel } from "@/components/admin/ui";
import { ProfileSecurity } from "@/components/admin/profile-security";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/**
 * The signed-in staff member's own account: their details, and turning
 * two-factor sign-in on or off (required, so not switchable, for the
 * super-admin). The dashboard layout has already checked they're staff.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/");

  const mfa = await getMfaState(supabase);
  const enrolled = mfa?.enrolled ?? false;
  const { count: backupCodesLeft } = enrolled
    ? await createAdminClient()
        .from("staff_mfa_backup_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("used_at", null)
    : { count: null };

  const rows: [string, string][] = [
    ["Name", profile.full_name],
    ["Email", profile.email],
    ["Role", roleLabel(profile.role)],
    ["Account created", formatDate(profile.created_at)],
    ["Last sign-in", formatDate(user.last_sign_in_at)],
  ];

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <PageHeading title="Profile" subtitle="Your staff account and sign-in security." />

      <Panel className="flex flex-col gap-3 p-5">
        <SectionLabel>Account</SectionLabel>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2.5 text-[14px] sm:grid-cols-[160px_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold text-ignite-muted">{label}</dt>
              <dd className="m-0 break-words text-ignite-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <ProfileSecurity
        email={profile.email}
        enrolled={enrolled}
        required={MFA_REQUIRED_ROLES.includes(profile.role)}
        backupCodesLeft={backupCodesLeft ?? null}
      />
    </div>
  );
}
