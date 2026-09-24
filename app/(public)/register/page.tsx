import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { LeaderSignIn, StaffSessionBlocked, AlreadyRegisteredBlocked } from "@/components/registration/leader-sign-in";
import { BrandLogo, GradientText, GridBackground, HeroShell, LogoHeaderBar } from "@/components/registration/ui";
import { createClient } from "@/lib/supabase/server";
import { LEADER_VERIFICATION_ENABLED } from "@/lib/config";
import { getRegistrationWindow } from "@/app/actions/registration-window";
import { isRegistrationCurrentlyOpen } from "@/lib/registration-window";
import { checkContactAvailability } from "@/app/actions/registration";

export const dynamic = "force-dynamic";

function ClosedScreen({ message }: { message?: string | null }) {
  return (
    <>
      <LogoHeaderBar />
      <HeroShell
        label="g-IGNITE 2026"
        title={
          <>
            Registration is <GradientText>closed.</GradientText>
          </>
        }
      >
        <BrandLogo className="mx-auto mb-5 h-14" />
        <p className="m-0 text-center text-[15px] leading-[1.6] text-ignite-muted">
          {message || "Registration for gIGNITE 2026 is no longer open. Contact the organizers if you think this is a mistake."}
        </p>
      </HeroShell>
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

    // Staff and participant leaders share the same Supabase Auth session.
    // Without this check, a staff member signed in at /login would land
    // here on their own staff session and get silently treated as a
    // verified leader — is_staff() (safe to call as anon/authenticated,
    // no grant needed: SQL functions default to PUBLIC execute) tells the
    // two apart now that only staff get a `profiles` row (see
    // 20260922020000_fix_staff_trigger_role_intent.sql).
    const { data: isStaff } = await supabase.rpc("is_staff");
    if (isStaff) {
      return <StaffSessionBlocked email={user.email} />;
    }

    // The email sign-in form checks this before a magic link even goes out
    // (see components/registration/leader-sign-in.tsx), but Google can't be
    // checked until the redirect lands back here with a verified email — a
    // leader whose email already belongs to a submitted team shouldn't be
    // able to start a second registration under the same identity either
    // way. A draft in progress (registration_drafts, not yet in
    // team_members) doesn't trip this — only an actual past submission does.
    const { emailTaken } = await checkContactAvailability({ email: user.email });
    if (emailTaken) {
      // Their verified session is enough to hand back their own team's
      // status link — the only way back to it if they lost it.
      const { data: statusToken } = await supabase.rpc("get_my_registration_status_token");
      return (
        <AlreadyRegisteredBlocked
          email={user.email}
          statusUrl={typeof statusToken === "string" && statusToken ? `/register/status/${statusToken}` : null}
        />
      );
    }

    return (
      <>
        <LogoHeaderBar />
        <main className="relative min-h-screen bg-ignite-bg px-4 py-10 font-ui text-ignite-ink-soft lg:px-16 lg:py-16">
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
      <main className="relative min-h-screen bg-ignite-bg px-4 py-10 font-ui text-ignite-ink-soft lg:px-16 lg:py-16">
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
