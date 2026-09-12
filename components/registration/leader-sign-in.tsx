"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo, PrimaryButton, SecondaryButton } from "./ui";

export function LeaderSignIn({
  authError,
  showTestButton,
}: {
  authError?: boolean;
  showTestButton?: boolean;
}) {
  const router = useRouter();
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gignite-bg p-8 text-center font-body text-gignite-text">
      <BrandLogo className="h-16" />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-heading text-2xl font-bold text-black">Sign in to register</h1>
        <p className="text-gignite-text/80">
          The team leader signs in with Google to confirm the email is really theirs. Everyone
          else on the team is added by the leader — no account needed for them.
        </p>
      </div>

      {authError && (
        <p className="max-w-sm rounded-lg bg-gignite-blue-pale px-4 py-2 text-sm text-gignite-blue">
          Sign-in didn&apos;t go through. Please try again.
        </p>
      )}

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <PrimaryButton type="button" onClick={handleSignIn} disabled={loading}>
          {loading ? "Redirecting…" : "Continue with Google"}
        </PrimaryButton>

        {showTestButton && (
          <>
            <SecondaryButton type="button" onClick={() => router.push("/register?dev=1")}>
              Test register (dev only, skips sign-in)
            </SecondaryButton>
            <p className="text-xs text-gignite-text/60">
              Only visible in local dev — Google sign-in isn&apos;t configured yet.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
