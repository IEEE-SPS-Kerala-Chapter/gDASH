"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkContactAvailability } from "@/app/actions/registration";
import { EMAIL_INVALID_MESSAGE, EMAIL_SPACES_MESSAGE } from "@/lib/validations/email";
import { Field, GradientText, HeroShell, LogoHeaderBar, PrimaryButton, SecondaryButton, TextInput } from "./ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase allows one new code per email address about every 60 seconds.
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Shared "your session can't be used here — sign out" screen. Two callers:
 * a staff account visiting /register (StaffSessionBlocked) and a leader
 * whose verified email already belongs to a past submission
 * (AlreadyRegisteredBlocked) — see both below.
 */
function SessionBlocked({
  title,
  message,
  statusUrl,
}: {
  title: string;
  message: ReactNode;
  /** When set, the main action is opening this status page; signing out becomes secondary. */
  statusUrl?: string | null;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <>
      <LogoHeaderBar onHero />
      <HeroShell label="g-IGNITE 2026" title={title} intro={<p className="m-0">{message}</p>}>
        <div className="flex w-full flex-col gap-3">
          {statusUrl && (
            <PrimaryButton type="button" onClick={() => router.push(statusUrl)} disabled={signingOut}>
              View your registration status
            </PrimaryButton>
          )}
          {statusUrl ? (
            <SecondaryButton type="button" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </SecondaryButton>
          ) : (
            <PrimaryButton type="button" onClick={handleSignOut} disabled={signingOut} loading={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </PrimaryButton>
          )}
        </div>
      </HeroShell>
    </>
  );
}

/**
 * Staff and participant leaders share the same Supabase Auth session (same
 * project, same cookies) — so a staff member signed in at /login who then
 * visits /register would otherwise sail straight past the leader-sign-in
 * gate on their own staff session, registering a team under their admin
 * identity without ever verifying via Google or an email code. This blocks
 * that instead of silently treating a staff session as a verified leader.
 */
export function StaffSessionBlocked({ email }: { email: string }) {
  return (
    <SessionBlocked
      title="You're signed in as staff"
      message={
        <>
          <span className="font-semibold">{email}</span> is a staff account, not a team leader. Sign
          out here, then verify with Google or an email code as the team leader to register.
        </>
      }
    />
  );
}

/**
 * An email-code sign-in can't be blocked before it's sent (nothing to check
 * against yet), and a Google sign-in can't be checked before the redirect
 * at all — the email is only known once the session lands back here. This
 * is that check for both paths: if the now-verified email already belongs
 * to a submitted team (as leader or member), block the wizard instead of
 * letting them start a second registration under the same identity.
 */
export function AlreadyRegisteredBlocked({ email, statusUrl }: { email: string; statusUrl?: string | null }) {
  return (
    <SessionBlocked
      title="This email is already registered"
      statusUrl={statusUrl}
      message={
        <>
          <span className="font-semibold">{email}</span> already belongs to a submitted team.
          {statusUrl ? " You can view your team's registration status and ID cards below." : ""} To
          register a different team, sign out and use a different email or Google account.
        </>
      }
    />
  );
}

export function LeaderSignIn({ authError }: { authError?: boolean }) {
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setGoogleError(false);
    const supabase = createClient();
    // On success the browser navigates away to Google, so nothing below
    // runs. signInWithOAuth reports a failure to start (network, provider
    // misconfigured) by returning an error rather than throwing — without
    // this, the button stayed on "Redirecting…" forever.
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/register` },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Google sign-in failed to start:", err);
      setGoogleLoading(false);
      setGoogleError(true);
    }
  }

  return (
    <>
      <LogoHeaderBar onHero />
      <HeroShell
        label="Registrations Open"
        title={
          <>
            Sign in to <GradientText>register.</GradientText>
          </>
        }
        intro={
          <>
            <p className="m-0">
              The team leader verifies their email with Google or a code we email them, to confirm it&apos;s
              really theirs. Everyone else on the team is added by the leader — no account needed for
              them.
            </p>
            <p className="m-0 text-[14px]">
              Already registered? Sign in with the same email to view your team&apos;s status.
            </p>
          </>
        }
      >

        {googleError && (
          <p className="mb-4 rounded-xl bg-ignite-danger-pale px-4 py-2.5 text-sm text-ignite-danger">
            Couldn&apos;t open Google sign-in. Check your connection and try again, or continue with email.
          </p>
        )}

        {authError && (
          <p className="mb-4 rounded-xl bg-ignite-danger-pale px-4 py-2.5 text-sm text-ignite-danger">
            Sign-in didn&apos;t go through. Please try again.
          </p>
        )}

        <div className="flex w-full flex-col gap-3">
          <PrimaryButton
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            loading={googleLoading}
          >
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </PrimaryButton>

          {mode === "choose" && (
            <>
              <div className="flex items-center gap-3 font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-ignite-faint">
                <span className="h-px flex-1 bg-ignite-edge/[0.07]" />
                or
                <span className="h-px flex-1 bg-ignite-edge/[0.07]" />
              </div>
              <SecondaryButton type="button" onClick={() => setMode("email")}>
                Continue with email
              </SecondaryButton>
            </>
          )}

          {mode === "email" && <EmailSignIn onBack={() => setMode("choose")} />}
        </div>
      </HeroShell>
    </>
  );
}

const ALREADY_REGISTERED_MESSAGE = "This email is already registered with another team.";
const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a minute and try again.";
const CODE_LENGTH = 6;

/** Supabase Auth's "slow down" errors: per-address resend interval, hourly email cap, per-IP request caps. */
function isRateLimited(err: { status?: number; code?: string }) {
  return (
    err.status === 429 ||
    err.code === "over_email_send_rate_limit" ||
    err.code === "over_request_rate_limit"
  );
}

/**
 * Email sign-in for leaders, in two steps: enter the email, then the
 * 6-digit code Supabase emails to it. A code (rather than a link) works on
 * any device and inside phone mail apps, and can't be used up by a mail
 * scanner pre-clicking links. On success the session cookie is set here and
 * /register re-renders server-side with it (wizard, or the already-registered
 * / staff screens), exactly as after Google sign-in.
 */
function EmailSignIn({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Guards a slow response from overwriting a newer one — only the result
  // for the latest-checked value is ever applied.
  const latestChecked = useRef("");

  async function handleEmailBlur(rawValue: string) {
    const value = rawValue.trim().toLowerCase();
    latestChecked.current = value;
    if (!EMAIL_PATTERN.test(value)) return;
    const { emailTaken } = await checkContactAvailability({ email: value });
    if (latestChecked.current !== value) return;
    if (emailTaken) {
      setError(ALREADY_REGISTERED_MESSAGE);
    } else if (error === ALREADY_REGISTERED_MESSAGE) {
      setError(null);
    }
  }

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const interval = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  /** Asks Supabase to email a code to `address`. Returns whether it went out. */
  async function sendCode(address: string): Promise<boolean> {
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        // Only used if the email template also includes the sign-in link.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/register`,
        // Tags the new auth.users row so handle_new_user() can tell a
        // participant leader apart from staff signing in the same
        // provider="email" way (password) — see
        // 20260922020000_fix_staff_trigger_role_intent.sql.
        data: { role_intent: "leader" },
      },
    });
    if (sendError) {
      setError(isRateLimited(sendError) ? RATE_LIMITED_MESSAGE : "Couldn't send the code. Please try again.");
      return false;
    }
    startCooldown();
    return true;
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    const problem = !trimmed
      ? "Enter your email address"
      : /\s/.test(trimmed)
        ? EMAIL_SPACES_MESSAGE
        : !EMAIL_PATTERN.test(trimmed)
          ? EMAIL_INVALID_MESSAGE
          : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    // Re-checked here, not just on blur — a paste-and-Enter never fires the
    // blur handler, and this is the last chance to catch it before an email
    // actually goes out.
    const { emailTaken } = await checkContactAvailability({ email: trimmed });
    if (emailTaken) {
      setError(ALREADY_REGISTERED_MESSAGE);
      setLoading(false);
      return;
    }
    const sent = await sendCode(trimmed);
    setLoading(false);
    if (sent) {
      setCode("");
      setSentTo(trimmed);
    }
  }

  async function handleResend() {
    if (!sentTo) return;
    setError(null);
    setLoading(true);
    await sendCode(sentTo);
    setLoading(false);
    setCode("");
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email`);
      return;
    }
    setError(null);
    setVerifying(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: sentTo, token: code, type: "email" });
    if (verifyError) {
      setVerifying(false);
      setError(
        isRateLimited(verifyError)
          ? RATE_LIMITED_MESSAGE
          : verifyError.status && verifyError.status < 500
            ? "That code is incorrect or has expired. Check the latest email, or send a new code."
            : "Couldn't verify the code. Please try again.",
      );
      return;
    }
    // Signed in: /register re-renders on the server with the new session.
    // Stays in the verifying state until that replaces this screen.
    router.refresh();
  }

  if (sentTo) {
    return (
      <form onSubmit={handleVerify} noValidate className="flex flex-col gap-3 text-left">
        <p className="m-0 text-[14px] leading-[1.5] text-ignite-ink-soft">
          We sent a {CODE_LENGTH}-digit code to <span className="font-semibold">{sentTo}</span>. It
          expires in 1 hour. Check your spam folder if it hasn&apos;t arrived.
        </p>
        <Field label="Sign-in code" error={error ?? undefined}>
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            placeholder="123456"
            aria-label={`${CODE_LENGTH}-digit sign-in code`}
            className="text-center text-[22px] font-bold tracking-[0.4em]"
            autoFocus
          />
        </Field>
        <PrimaryButton type="submit" disabled={verifying} loading={verifying}>
          {verifying ? "Verifying…" : "Verify and continue"}
        </PrimaryButton>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
            }}
            disabled={verifying}
            className="text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || loading || verifying}
            className="text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta disabled:cursor-not-allowed disabled:text-ignite-muted"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : loading ? "Sending…" : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} noValidate className="flex flex-col gap-3 text-left">
      <Field label="Email" error={error ?? undefined}>
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => void handleEmailBlur(e.target.value)}
          placeholder="you@college.ac.in"
          autoFocus
        />
      </Field>
      <PrimaryButton type="submit" disabled={loading} loading={loading}>
        {loading ? "Sending…" : "Email me a code"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onBack}
        className="text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta"
      >
        Back
      </button>
    </form>
  );
}
