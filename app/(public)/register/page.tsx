import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { LeaderSignIn } from "@/components/registration/leader-sign-in";
import { BrandLogo } from "@/components/registration/ui";
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
      <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
        <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
          <BrandLogo className="h-14" />
        </div>
        <RegistrationWizard leaderEmail={user.email} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
      <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
        <BrandLogo className="h-14" />
      </div>
      <RegistrationWizard />
    </main>
  );
}
