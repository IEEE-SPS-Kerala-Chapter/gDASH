import Link from "next/link";
import { getRegistrationStatus } from "@/app/actions/registration";
import { cn } from "@/lib/utils";
import { BrandLogo, Eyebrow, LogoHeaderBar } from "@/components/registration/ui";
import { IdCard } from "@/components/registration/id-card";
import { StatusSignOutBar } from "@/components/registration/status-sign-out-bar";
import { StatusBackGuard } from "@/components/registration/submission-back-guards";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-ignite-edge/[0.06] text-ignite-ink ring-1 ring-ignite-edge/20",
  under_review: "bg-ignite-lime text-ignite-navy",
  shortlisted: "bg-ignite-success-pale text-ignite-success",
  rejected: "bg-ignite-danger-pale text-ignite-danger",
};

export default async function StatusPage({ params }: { params: { token: string } }) {
  const result = await getRegistrationStatus(params.token);

  if (!result.found) {
    return (
      <>
        <LogoHeaderBar />
        <main className="flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center font-ui text-ignite-ink-soft">
          <BrandLogo className="h-14 lg:h-16" />
          <h1 className="font-display text-2xl font-bold text-ignite-ink">
            {result.systemError ? "Couldn't check your status" : "Registration not found"}
          </h1>
          <p className="max-w-sm text-ignite-muted">
            {result.systemError
              ? "Something went wrong on our end — this isn't about your registration. Try refreshing in a moment."
              : "That status link doesn't match a registration. Make sure the whole link was copied. Anyone on the team can also sign in on the registration page with their registered email to get back to this page."}
          </p>
          <Link href="/" className="font-semibold text-ignite-ink hover:text-ignite-magenta">
            Go to registration →
          </Link>
        </main>
      </>
    );
  }

  const { team, members, registration } = result;

  // A participant session left over on this device (see StatusSignOutBar).
  // Staff sessions are left alone — an organizer opening a team's status
  // link shouldn't be offered a participant-style sign-out here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isStaff } = user ? await supabase.rpc("is_staff") : { data: false };
  const participantEmail = user?.email && !isStaff ? user.email : null;
  const statusStyle = STATUS_STYLES[registration.status] ?? STATUS_STYLES.submitted;

  return (
    <>
      <StatusBackGuard />
      <LogoHeaderBar onHero />
      <main className="min-h-[calc(100vh-88px)] bg-ignite-bg font-ui text-ignite-ink-soft">
        <section className="hero-themed px-4 pb-12 pt-8 text-ignite-ink lg:px-16 lg:pb-16 lg:pt-12">
          <div className="mx-auto flex max-w-[760px] flex-col gap-6">
            {participantEmail && <StatusSignOutBar email={participantEmail} />}
            <span className="inline-flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.16em]">
              <span aria-hidden="true" className="h-2 w-2 bg-ignite-orange" />
              Registration status
            </span>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="m-0 break-words font-display text-[36px] font-medium leading-[1.1] tracking-[-0.03em] text-ignite-ink lg:text-[52px]">
                  {team.name}
                </h1>
                <p className="m-0 text-[15px] text-ignite-ink-soft">
                  {team.ai_theme} · {team.district}
                </p>
                <span
                  className="border-brand-gradient mt-1 inline-block w-fit rounded-full px-3.5 py-1 text-[13px] font-bold tracking-[0.06em] text-ignite-ink"
                  style={{ "--brand-border-fill": "rgb(var(--ig-surface))" } as React.CSSProperties}
                >
                  {team.entry_code}
                </span>
              </div>
              <span className={cn("rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em]", statusStyle)}>
                {registration.status.replace("_", " ")}
              </span>
            </div>
          </div>
        </section>

        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-10 lg:px-0">
          <div className="flex flex-col gap-5 rounded-[20px] border border-ignite-edge/[0.06] bg-ignite-surface p-6 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3">
              <Eyebrow>Members</Eyebrow>
              {members.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-ignite-ink">
                    {m.full_name} {m.is_leader && <span className="text-ignite-magenta">· Leader</span>}
                    <span className="ml-2 text-[12px] font-bold tracking-[0.04em] text-ignite-muted">{m.member_code}</span>
                  </span>
                  <span className="text-ignite-muted">{m.college}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-ignite-edge/[0.07] pt-5">
              <Eyebrow>Idea</Eyebrow>
              <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ignite-ink-soft">
                {registration.problem_statement}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Eyebrow>ID cards</Eyebrow>
            <p className="m-0 text-[14px] text-ignite-muted">
              Download every team member&apos;s ID card — bring the physical or digital copy to check in on event day.
            </p>
            <div className="flex flex-col gap-5">
              {members.map((m) => (
                <IdCard key={m.id} teamName={team.name} member={m} />
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-ignite-muted">
            Bookmark this page. You can also get back here by signing in on the registration page with the email you registered.
          </p>
        </div>
      </main>
    </>
  );
}
