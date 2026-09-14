import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo, GridBackground, LogoHeaderBar } from "@/components/admin/ui";
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
      <LogoHeaderBar />
      <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-8 bg-gignite-bg p-4 font-body text-gignite-text">
        <GridBackground />
        <BrandLogo className="relative z-10 h-16" />
        <div className="relative z-10 w-full max-w-sm">
          <ResetPasswordForm />
        </div>
      </main>
    </>
  );
}
