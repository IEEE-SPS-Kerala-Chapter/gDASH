import Link from "next/link";
import { getRegistrationStatus } from "@/app/actions/registration";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/registration/ui";

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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
        <BrandLogo className="h-14 lg:h-16" />
        <h1 className="font-heading text-2xl font-bold text-black">
          {result.systemError ? "Couldn't check your status" : "Registration not found"}
        </h1>
        <p className="max-w-sm text-gignite-text/80">
          {result.systemError
            ? "Something went wrong on our end — this isn't about your registration. Try refreshing in a moment."
            : "That status link doesn't match a registration. Double-check the link your team leader received, or register a new team."}
        </p>
        <Link href="/register" className="font-semibold text-gignite-blue hover:text-gignite-accent">
          Go to registration →
        </Link>
      </main>
    );
  }

  const { team, members, registration } = result;
  const statusStyle = STATUS_STYLES[registration.status] ?? STATUS_STYLES.submitted;

  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text">
      <div className="mx-auto flex max-w-[460px] flex-col gap-6">
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
                </span>
                <span className="text-gignite-text/70">{m.college}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-gignite-divider pt-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
              Idea
            </span>
            <p className="m-0 text-sm leading-relaxed text-gignite-text">
              {registration.problem_statement}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gignite-text/60">
          Bookmark this page — it&apos;s your only way back to your registration status.
        </p>
      </div>
    </main>
  );
}
