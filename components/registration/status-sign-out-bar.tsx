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
    <div className="flex items-center justify-between gap-3 rounded-full bg-ignite-surface/70 px-5 py-2.5 font-ui text-[13px] text-ignite-ink-soft ring-1 ring-ignite-edge/10">
      <span className="min-w-0 truncate">
        Signed in as <span className="font-semibold">{email}</span>
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="flex-none font-semibold text-ignite-ink hover:text-ignite-magenta disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
