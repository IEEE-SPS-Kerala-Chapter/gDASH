"use client";

import { useEffect, useState } from "react";
import { getDeckDownloadUrl } from "@/app/actions/admin";
import { deckFileName } from "@/lib/deck-file-name";
import { Spinner } from "@/components/admin/ui";

/**
 * The uploaded-deck panel on the team detail page: filename, upload date,
 * a download link, and the deck itself rendered inline via iframe — no
 * modal, no separate tab needed to view it. Supersedes the old
 * InlineDeckViewer (iframe-only) now that the design calls for the
 * surrounding header row too; both need the same signed URL, so this owns
 * the fetch once instead of fetching it twice.
 */
export function DeckPanel({ deckPath, uploadedAt }: { deckPath: string; uploadedAt: string }) {
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

  const uploadedLabel = new Date(uploadedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">Uploaded deck</span>
          <span className="text-[15px] font-semibold text-black">{deckFileName(deckPath)}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="font-mono text-[12px] text-gignite-text/70">uploaded {uploadedLabel}</span>
          {state.status === "ready" && (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b-[1.5px] border-gignite-blue/35 pb-0.5 text-[14px] font-semibold text-gignite-blue transition-colors hover:border-gignite-accent hover:text-gignite-accent"
            >
              Download ↗
            </a>
          )}
        </div>
      </div>
      <div className="h-[520px] overflow-hidden rounded-[10px] border border-gignite-divider bg-gignite-bg">
        {state.status === "loading" && (
          <div className="flex h-full items-center justify-center gap-2.5 text-[14px] text-gignite-text/60">
            <Spinner />
            Loading deck…
          </div>
        )}
        {state.status === "error" && (
          <div className="flex h-full items-center justify-center text-[14px] text-gignite-danger">{state.message}</div>
        )}
        {state.status === "ready" && <iframe src={state.url} title="Uploaded deck" className="h-full w-full border-0" />}
      </div>
    </div>
  );
}
