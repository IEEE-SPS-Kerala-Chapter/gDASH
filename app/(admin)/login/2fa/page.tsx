import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GradientText, HeroShell, LogoHeaderBar } from "@/components/admin/ui";
import { TwoFactor } from "@/components/admin/two-factor";
import { getMfaState, hasVerifiedTotp, MFA_REQUIRED_ROLES, mfaSatisfied } from "@/lib/staff-mfa";

const STAFF_ROLES = ["admin", "judge", "volunteer", "super_admin"];

// After the password: enter the authenticator-app code, or — with no app
// yet — choose whether to set one up (the super-admin must). Same order of
// gates as dashboard/layout.tsx, which sends staff here.
export default async function TwoFactorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_reset_password, mfa_skipped_at")
    .eq("id", user.id)
    .single();
  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    redirect("/");
  }
  if (profile.must_reset_password) {
    redirect("/reset-password");
  }
  // Not a redirect: the server actions that pass 2FA re-render this page
  // with the upgraded session, and a redirect here would cut off the
  // backup-codes screen shown right after setup. TwoFactor sends someone
  // who has nothing left to do here on to the dashboard itself.
  const mfa = await getMfaState(supabase);
  const enrolled = mfa?.enrolled ?? hasVerifiedTotp(user);
  const nothingToDo = mfaSatisfied(mfa, profile.role) && (enrolled || Boolean(profile.mfa_skipped_at));
  const initialMode = nothingToDo
    ? "done"
    : enrolled
      ? "verify"
      : MFA_REQUIRED_ROLES.includes(profile.role)
        ? "setup"
        : "choose";

  return (
    <>
      <LogoHeaderBar onHero />
      <HeroShell
        label="Staff access"
        title={
          <>
            Two-factor <GradientText>sign-in.</GradientText>
          </>
        }
        intro={<p className="m-0">Signed in as {user.email}</p>}
      >
        <TwoFactor
          initialMode={initialMode}
          email={user.email ?? ""}
        />
      </HeroShell>
    </>
  );
}
