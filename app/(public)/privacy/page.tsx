import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow, LogoHeaderBar } from "@/components/registration/ui";

export const metadata: Metadata = {
  title: "Privacy Policy — gIGNITE 2026",
};

// Required by Google for publishing the "Sign in with Google" app, and linked
// from the sign-in screen. Keep it in step with what the platform actually
// collects — update it whenever a new kind of data or service is added.
const LAST_UPDATED = "27 September 2026";
const CONTACT_EMAIL = "gignite@gadgeon.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[19px] font-bold text-ignite-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ignite-ink-soft">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <LogoHeaderBar />
      <main className="min-h-screen bg-ignite-bg px-4 py-10 font-ui lg:px-16 lg:py-14">
        <article className="mx-auto flex max-w-[760px] flex-col gap-7">
          <header className="flex flex-col gap-2">
            <Eyebrow>gIGNITE 2026</Eyebrow>
            <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-ignite-ink">Privacy Policy</h1>
            <p className="text-[14px] text-ignite-muted">Last updated {LAST_UPDATED}</p>
          </header>

          <Section title="Who we are">
            <p>
              gIGNITE 2026 is organised by the IEEE Signal Processing Society Kerala Chapter together with Gadgeon
              Smart Systems (&ldquo;the organisers&rdquo;, &ldquo;we&rdquo;). This policy explains what information the
              gIGNITE registration platform collects, why, and how it is protected.
            </p>
          </Section>

          <Section title="What we collect">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <b>Team details:</b> team name, AI theme and district.
              </li>
              <li>
                <b>Team members:</b> for the team leader and each member — full name, email address, phone number,
                college, branch, year of study and role in the team.
              </li>
              <li>
                <b>College ID card photos</b> of the leader and members, used only to check eligibility.
              </li>
              <li>
                <b>Your idea:</b> your answers about the problem, solution, AI approach and expected impact, an
                optional supporting link, and the pitch deck you upload.
              </li>
              <li>
                <b>Sign-in information:</b> the team leader&apos;s email address. If you choose &ldquo;Continue with
                Google&rdquo;, Google shares your name, email address and profile picture with us — we use this only
                to confirm your email address. We do not access your Google contacts, files or any other data.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To run registration, verify that participants are eligible students, and prevent duplicate entries.</li>
              <li>For the organising team and judges to review and evaluate submissions.</li>
              <li>To contact teams about their registration, results and the event.</li>
              <li>To produce event ID cards and manage event-day check-in.</li>
            </ul>
            <p>We do not sell your information or use it for advertising.</p>
          </Section>

          <Section title="Who can see it">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <b>Your team:</b> a team&apos;s details are shown only to its own members, after they sign in with
                their registered email address.
              </li>
              <li>
                <b>Organisers:</b> staff see registrations according to their role — judges see the teams assigned to
                them. College ID card photos are visible only to organising administrators.
              </li>
              <li>
                <b>Service providers</b> that run the platform on our behalf: Supabase (database, file storage and
                sign-in; data stored in Singapore), Vercel (website hosting), Google (Google sign-in and delivery of
                sign-in code emails) and Cloudflare (automated bot protection). They process data only to provide
                these services.
              </li>
            </ul>
            <p>Other teams can never see your team&apos;s details or your idea.</p>
          </Section>

          <Section title="How long we keep it">
            <p>
              We keep registration information for the duration of gIGNITE 2026 and for as long afterwards as is needed
              to announce results and issue certificates. After that, it is deleted.
            </p>
          </Section>

          <Section title="Cookies and browser storage">
            <p>
              We use only what the site needs to work: a sign-in session cookie, and small settings saved in your
              browser (such as the light/dark theme). We do not use advertising or analytics trackers.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is sent over encrypted connections. Access is limited by role, uploaded files are stored privately,
              and staff actions are recorded in an audit log.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can ask to see, correct or delete your team&apos;s information, or withdraw your registration, by
              emailing{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ignite-ink underline">
                {CONTACT_EMAIL}
              </a>
              . The team leader can make requests on behalf of the whole team.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>If we change this policy, we will update the date at the top of this page.</p>
          </Section>

          <Link href="/" className="w-fit font-semibold text-ignite-ink hover:text-ignite-magenta">
            ← Back to registration
          </Link>
        </article>
      </main>
    </>
  );
}
