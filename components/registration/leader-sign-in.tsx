"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo, Field, GridBackground, LogoHeaderBar, PrimaryButton, SecondaryButton, TextInput } from "./ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Staff and participant leaders share the same Supabase Auth session (same
 * project, same cookies) — so a staff member signed in at /login who then
 * visits /register would otherwise sail straight past the leader-sign-in
 * gate on their own staff session, registering a team under their admin
 * identity without ever verifying via Google or a magic link. This blocks
 * that instead of silently treating a staff session as a verified leader.
 */
export function StaffSessionBlocked({ email }: { email: string }) {
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
      <LogoHeaderBar />
      <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-6 bg-gignite-bg p-8 text-center font-body text-gignite-text">
        <GridBackground />
        <BrandLogo className="relative z-10 h-16" />
        <div className="relative z-10 flex max-w-sm flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold text-black">You&apos;re signed in as staff</h1>
          <p className="text-gignite-text/80">
            <span className="font-semibold">{email}</span> is a staff account, not a team leader.
            Sign out here, then verify with Google or a sign-in link as the team leader to register.
          </p>
        </div>
        <div className="relative z-10 w-full max-w-xs">
          <PrimaryButton type="button" onClick={handleSignOut} disabled={signingOut} loading={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </PrimaryButton>
        </div>
      </main>
    </>
  );
}

export function LeaderSignIn({ authError }: { authError?: boolean }) {
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/register` },
    });
    // Browser navigates away to Google here; setGoogleLoading(false) never
    // runs on success. It only matters if signInWithOAuth itself throws
    // before redirecting (e.g. the provider isn't configured yet).
  }

  return (
    <>
      <LogoHeaderBar />
      <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-6 bg-gignite-bg p-8 text-center font-body text-gignite-text">
        <GridBackground />
        <BrandLogo className="relative z-10 h-16" />
        <div className="relative z-10 flex max-w-sm flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold text-black">Sign in to register</h1>
          <p className="text-gignite-text/80">
            The team leader verifies their email with Google or a sign-in link to confirm it&apos;s
            really theirs. Everyone else on the team is added by the leader — no account needed for
            them.
          </p>
        </div>

        {authError && (
          <p className="relative z-10 max-w-sm rounded-lg bg-gignite-blue-pale px-4 py-2 text-sm text-gignite-blue">
            Sign-in didn&apos;t go through. Please try again.
          </p>
        )}

        <div className="relative z-10 flex w-full max-w-xs flex-col gap-3">
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
              <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.12em] text-gignite-text/50">
                <span className="h-px flex-1 bg-gignite-divider" />
                or
                <span className="h-px flex-1 bg-gignite-divider" />
              </div>
              <SecondaryButton type="button" onClick={() => setMode("email")}>
                Continue with email
              </SecondaryButton>
            </>
          )}

          {mode === "email" && <EmailSignIn onBack={() => setMode("choose")} />}
        </div>
      </main>
    </>
  );
}

function EmailSignIn({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/register`,
        // Tags the new auth.users row so handle_new_user() can tell a
        // participant leader apart from staff signing in the same
        // provider="email" way (password) — see
        // 20260922020000_fix_staff_trigger_role_intent.sql.
        data: { role_intent: "leader" },
      },
    });
    setLoading(false);
    if (sendError) {
      setError("Couldn't send the sign-in link. Please try again.");
      return;
    }
    setSentTo(trimmed);
    startCooldown();
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border-[1.5px] border-gignite-border bg-gignite-surface p-4 text-left">
        <p className="text-[14px] leading-[1.5] text-gignite-text">
          Check <span className="font-semibold">{sentTo}</span> for a sign-in link. It&apos;ll bring
          you straight back here, signed in.
        </p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className="text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={cooldown > 0 || loading}
            className="text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent disabled:cursor-not-allowed disabled:text-gignite-text/40"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : loading ? "Sending…" : "Resend link"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
      <Field label="Email" error={error ?? undefined}>
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@college.ac.in"
          autoFocus
        />
      </Field>
      <PrimaryButton type="submit" disabled={loading} loading={loading}>
        {loading ? "Sending…" : "Send sign-in link"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onBack}
        className="text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent"
      >
        Back
      </button>
    </form>
  );
}
