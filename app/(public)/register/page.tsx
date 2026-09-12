import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { LeaderSignIn } from "@/components/registration/leader-sign-in";
import { BrandLogo } from "@/components/registration/ui";
import { createClient } from "@/lib/supabase/server";

// Google OAuth isn't configured yet (see googleOauth.md) — this lets you
// exercise the form without it in the meantime. Gated on NODE_ENV, not just
// hidden in the UI: Vercel always sets NODE_ENV=production for a real
// deployment, so this is dead code there regardless of the query param.
const ALLOW_TEST_REGISTER = process.env.NODE_ENV !== "production";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { auth_error?: string; dev?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const testMode = ALLOW_TEST_REGISTER && searchParams.dev === "1";

  if (!user?.email && !testMode) {
    return <LeaderSignIn authError={Boolean(searchParams.auth_error)} showTestButton={ALLOW_TEST_REGISTER} />;
  }

  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
      <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
        <BrandLogo className="h-14" />
      </div>
      <RegistrationWizard leaderEmail={user?.email ?? ""} testMode={testMode} />
    </main>
  );
}
