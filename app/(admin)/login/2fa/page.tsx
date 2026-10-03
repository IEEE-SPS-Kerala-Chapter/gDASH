import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GradientText, HeroShell, LogoHeaderBar } from "@/components/admin/ui";
import { TwoFactor } from "@/components/admin/two-factor";
import { hasVerifiedTotp, sessionIsAal2 } from "@/lib/staff-mfa";

const STAFF_ROLES = ["admin", "judge", "volunteer", "super_admin"];

// After the password: set up an authenticator app (first time) or enter its
// code. Same order of gates as dashboard/layout.tsx, which sends staff here.
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
    .select("role, must_reset_password")
    .eq("id", user.id)
    .single();
  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    redirect("/");
  }
  if (profile.must_reset_password) {
    redirect("/reset-password");
  }
  if (await sessionIsAal2(supabase)) {
    redirect("/dashboard");
  }

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
        <TwoFactor initialMode={hasVerifiedTotp(user) ? "verify" : "setup"} email={user.email ?? ""} />
      </HeroShell>
    </>
  );
}
