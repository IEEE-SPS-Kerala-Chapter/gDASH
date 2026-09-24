import Link from "next/link";
import { getRegistrationStatus } from "@/app/actions/registration";
import { cn } from "@/lib/utils";
import { BrandLogo, LogoHeaderBar } from "@/components/registration/ui";
import { IdCard } from "@/components/registration/id-card";
import { StatusSignOutBar } from "@/components/registration/status-sign-out-bar";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-gignite-blue-pale text-gignite-blue",
  under_review: "bg-[#FCEFD9] text-gignite-warn",
  shortlisted: "bg-[#E3F3E8] text-[#1E7A3E]",
  rejected: "bg-[#FBE4DD] text-gignite-danger",
};

export default async function StatusPage({ params }: { params: { token: string } }) {
  const result = await getRegistrationStatus(params.token);

  if (!result.found) {
    return (
      <>
        <LogoHeaderBar />
        <main className="flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
          <BrandLogo className="h-14 lg:h-16" />
          <h1 className="font-heading text-2xl font-bold text-black">
            {result.systemError ? "Couldn't check your status" : "Registration not found"}
          </h1>
          <p className="max-w-sm text-gignite-text/80">
            {result.systemError
              ? "Something went wrong on our end — this isn't about your registration. Try refreshing in a moment."
              : "That status link doesn't match a registration. Make sure the whole link was copied. Anyone on the team can also sign in on the registration page with their registered email to get back to this page."}
          </p>
          <Link href="/register" className="font-semibold text-gignite-blue hover:text-gignite-accent">
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
      <LogoHeaderBar />
      <main className="min-h-[calc(100vh-88px)] bg-gignite-bg px-4 py-10 font-body text-gignite-text">
        <div className="mx-auto flex max-w-[460px] flex-col gap-6">
          {participantEmail && <StatusSignOutBar email={participantEmail} />}
          <div className="flex items-center gap-3">
            <BrandLogo className="h-12 lg:h-16" />
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-gignite-blue">
              Registration status
            </span>
          </div>

          <div className="flex flex-col gap-4 rounded-[24px] border border-black/[0.08] bg-gignite-surface p-6 shadow-[0_16px_34px_rgba(32,65,154,0.09)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="m-0 font-heading text-2xl font-bold text-black">{team.name}</h1>
                <p className="m-0 text-sm text-gignite-text/70">
                  {team.ai_theme} · {team.district}
                </p>
                <span className="mt-1 inline-block rounded-full bg-gignite-blue-pale px-2.5 py-0.5 font-mono text-[11px] font-semibold text-gignite-blue">
                  {team.entry_code}
                </span>
              </div>
              <span className={cn("rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em]", statusStyle)}>
                {registration.status.replace("_", " ")}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
                Members
              </span>
              {members.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-black">
                    {m.full_name} {m.is_leader && <span className="text-gignite-blue">· Leader</span>}
                    <span className="ml-2 font-mono text-[11px] text-gignite-blue">{m.member_code}</span>
                  </span>
                  <span className="text-gignite-text/70">{m.college}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-gignite-divider pt-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
                Idea
              </span>
              <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-gignite-text">
                {registration.problem_statement}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
              ID cards
            </span>
            <p className="m-0 text-xs text-gignite-text/70">
              Download every team member&apos;s ID card — bring the physical or digital copy to check in on event day.
            </p>
            {members.map((m) => (
              <IdCard key={m.id} teamName={team.name} member={m} />
            ))}
          </div>

          <p className="text-center text-xs text-gignite-text/60">
            Bookmark this page. You can also get back here by signing in on the registration page with the email you registered.
          </p>
        </div>
      </main>
    </>
  );
}
