"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Submitting signs the leader out automatically (best-effort — see
 * registration-wizard.tsx). This bar only appears when a participant
 * session is still active on the status page, e.g. that sign-out failed or
 * they came back here by signing in — so a shared device can still be
 * signed out without going back to the form.
 */
export function StatusSignOutBar({ email }: { email: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gignite-blue-pale px-4 py-2 text-[13px] text-gignite-blue">
      <span className="min-w-0 truncate">
        Signed in as <span className="font-semibold">{email}</span>
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="flex-none font-semibold hover:text-gignite-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
