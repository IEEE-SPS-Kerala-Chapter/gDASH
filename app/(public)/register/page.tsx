import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { LeaderSignIn } from "@/components/registration/leader-sign-in";
import { BrandLogo, GridBackground, LogoHeaderBar } from "@/components/registration/ui";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_OAUTH_ENABLED } from "@/lib/config";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { auth_error?: string };
}) {
  // --- Google OAuth gate (disabled — see lib/config.ts) ---
  // Kept intact, not deleted, so re-enabling later is just flipping the
  // flag. While disabled, skip the session lookup entirely and always
  // render the wizard directly with an editable leader email.
  if (GOOGLE_OAUTH_ENABLED) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return <LeaderSignIn authError={Boolean(searchParams.auth_error)} />;
    }

    return (
      <>
        <LogoHeaderBar />
        <main className="relative min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
          <GridBackground />
          <div className="relative z-10">
            <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
              <BrandLogo className="h-14" />
            </div>
            <RegistrationWizard leaderEmail={user.email} />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <LogoHeaderBar />
      <main className="relative min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
        <GridBackground />
        <div className="relative z-10">
          <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
            <BrandLogo className="h-14" />
          </div>
          <RegistrationWizard />
        </div>
      </main>
    </>
  );
}
