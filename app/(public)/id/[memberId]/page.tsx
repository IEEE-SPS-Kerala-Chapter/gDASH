import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { checkMemberExists, getMemberResult } from "@/app/actions/registration";
import { BrandLogo, GradientText } from "@/components/registration/ui";

// Every gIGNITE ID card's QR code points here. Phase 7 (results reveal):
// once an admin publishes results, a signed-in member of the card's team
// sees the team's result; anyone else only sees whether results are out.
// get_member_result() enforces that in the database. Event-day check-in
// phases build on this same URL later — see id-card-future-phases.md.
// A garbage/malicious id 404s via member_exists() rather than rendering.
export default async function MemberIdPage(props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const exists = await checkMemberExists(params.memberId);
  if (!exists) {
    notFound();
  }

  const result = await getMemberResult(params.memberId);

  if (result.state === "result") {
    const shortlisted = result.outcome === "shortlisted";
    return (
      <Shell>
        <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.16em] text-ignite-muted">{result.teamName}</p>
        <h1 className="m-0 font-display text-3xl font-bold tracking-[-0.02em] text-ignite-ink">
          {shortlisted ? (
            <>
              <GradientText>Shortlisted</GradientText> 🎉
            </>
          ) : (
            "Not shortlisted this time"
          )}
        </h1>
        {result.message && (
          <p className="m-0 max-w-md whitespace-pre-wrap break-words text-ignite-ink-soft">{result.message}</p>
        )}
      </Shell>
    );
  }

  if (result.state === "pending") {
    return (
      <Shell>
        <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.16em] text-ignite-muted">{result.teamName}</p>
        <h1 className="m-0 font-display text-3xl font-bold tracking-[-0.02em] text-ignite-ink">Still under review</h1>
        <p className="m-0 max-w-sm text-ignite-muted">
          Your team&apos;s submission is still being reviewed. Your result will appear here as soon as it&apos;s ready.
        </p>
      </Shell>
    );
  }

  if (result.state === "sign_in_required") {
    return (
      <Shell>
        <h1 className="m-0 font-display text-3xl font-bold tracking-[-0.02em] text-ignite-ink">
          gIGNITE — <GradientText>results are out</GradientText>
        </h1>
        <p className="m-0 max-w-sm text-ignite-muted">
          Sign in with the email you registered with — the team leader or any member — to see your team&apos;s
          result.
        </p>
        <Link href="/" className="font-semibold text-ignite-ink hover:text-ignite-magenta">
          Sign in →
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="m-0 font-display text-3xl font-bold tracking-[-0.02em] text-ignite-ink">
        gIGNITE — <GradientText>results coming soon</GradientText>
      </h1>
      <p className="m-0 max-w-sm text-ignite-muted">
        Results haven&apos;t been announced yet. Check back here once the organisers announce them.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center font-ui text-ignite-ink-soft">
      <BrandLogo className="h-12" />
      {children}
    </main>
  );
}
