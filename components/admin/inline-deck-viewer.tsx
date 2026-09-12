"use client";

import { useEffect, useState } from "react";
import { getDeckDownloadUrl } from "@/app/actions/admin";

/**
 * Renders the uploaded deck directly in the page via an iframe — no modal,
 * no new tab. The signed URL is fetched once when this mounts (5-minute
 * expiry from getDeckDownloadUrl; if it goes stale on a long-open tab, a
 * refresh re-fetches a fresh one).
 */
export function InlineDeckViewer({ deckPath }: { deckPath: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getDeckDownloadUrl(deckPath);
      if (cancelled) return;
      if (!result.success) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "ready", url: result.url });
    })();
    return () => {
      cancelled = true;
    };
  }, [deckPath]);

  if (state.status === "loading") {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        Loading deck…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border bg-card text-sm text-destructive">
        {state.message}
      </div>
    );
  }

  return <iframe src={state.url} title="Uploaded deck" className="h-[70vh] w-full rounded-md border" />;
}
