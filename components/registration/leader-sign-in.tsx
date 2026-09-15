"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo, GridBackground, LogoHeaderBar, PrimaryButton } from "./ui";

export function LeaderSignIn({ authError }: { authError?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/register` },
    });
    // Browser navigates away to Google here; setLoading(false) never runs
    // on success. It only matters if signInWithOAuth itself throws before
    // redirecting (e.g. the provider isn't configured yet).
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
          The team leader signs in with Google to confirm the email is really theirs. Everyone
          else on the team is added by the leader — no account needed for them.
        </p>
      </div>

      {authError && (
        <p className="relative z-10 max-w-sm rounded-lg bg-gignite-blue-pale px-4 py-2 text-sm text-gignite-blue">
          Sign-in didn&apos;t go through. Please try again.
        </p>
      )}

      <div className="relative z-10 w-full max-w-xs">
        <PrimaryButton type="button" onClick={handleSignIn} disabled={loading} loading={loading}>
          {loading ? "Redirecting…" : "Continue with Google"}
        </PrimaryButton>
      </div>
      </main>
    </>
  );
}
