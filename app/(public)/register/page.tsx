import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { LeaderSignIn } from "@/components/registration/leader-sign-in";
import { BrandLogo, GridBackground, LogoHeaderBar } from "@/components/registration/ui";
import { createClient } from "@/lib/supabase/server";
import { LEADER_VERIFICATION_ENABLED } from "@/lib/config";
import { getRegistrationWindow } from "@/app/actions/registration-window";
import { isRegistrationCurrentlyOpen } from "@/lib/registration-window";

function ClosedScreen({ message }: { message?: string | null }) {
  return (
    <>
      <LogoHeaderBar />
      <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
        <GridBackground />
        <BrandLogo className="relative z-10 h-16" />
        <div className="relative z-10 flex max-w-sm flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold text-black">Registration is closed</h1>
          <p className="text-gignite-text/80">
            {message || "Registration for gIGNITE 2026 is no longer open. Contact the organizers if you think this is a mistake."}
          </p>
        </div>
      </main>
    </>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { auth_error?: string };
}) {
  // Checked before anything else — no point sending a leader through
  // Google OAuth, or rendering the wizard at all, once registration has
  // closed. submit_registration() enforces the same window server-side
  // regardless; this is just so the page reflects it too.
  const registrationWindow = await getRegistrationWindow();
  if (!isRegistrationCurrentlyOpen(registrationWindow)) {
    return <ClosedScreen message={registrationWindow.closedMessage} />;
  }

  // --- Leader verification gate (see lib/config.ts) ---
  // Kept intact even while disabled, so re-enabling later is just flipping
  // the flag. While disabled, skip the session lookup entirely and always
  // render the wizard directly with an editable leader email.
  if (LEADER_VERIFICATION_ENABLED) {
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
