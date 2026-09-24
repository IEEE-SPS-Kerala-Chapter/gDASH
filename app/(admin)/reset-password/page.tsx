import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GradientText, HeroShell, LogoHeaderBar } from "@/components/admin/ui";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";

// Deliberately a sibling of dashboard/, not nested inside it, so it isn't
// itself subject to dashboard/layout.tsx's must_reset_password redirect —
// that would loop. Runs its own minimal checks instead.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_reset_password")
    .eq("id", user.id)
    .single();

  // Already reset (or not a flagged account) — nothing to do here.
  if (!profile || !profile.must_reset_password) {
    redirect("/dashboard");
  }

  return (
    <>
      <LogoHeaderBar onHero />
      <HeroShell
        label="Staff access"
        title={
          <>
            Secure your <GradientText>account.</GradientText>
          </>
        }
      >
        <ResetPasswordForm />
      </HeroShell>
    </>
  );
}
