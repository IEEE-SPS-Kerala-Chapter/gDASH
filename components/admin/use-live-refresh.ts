"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MIN_GAP_MS = 5_000;

/**
 * Re-fetches the current page's server data when the tab regains focus and
 * every `intervalMs` while it's visible, so an admin sees what other admins
 * have changed (status, verification, judge assignments) without a manual
 * reload. Components holding the data in local state must re-sync from
 * their props for this to show up — see TeamsBrowser / TeamDetail.
 */
export function useLiveRefresh({ enabled = true, intervalMs = 30_000 }: { enabled?: boolean; intervalMs?: number } = {}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    function refresh() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      router.refresh();
    }
    const timer = setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, enabled, intervalMs]);
}
