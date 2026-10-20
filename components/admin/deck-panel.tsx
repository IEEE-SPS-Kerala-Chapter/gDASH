"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getDeckDownloadUrl } from "@/app/actions/admin";
import { deckFileName } from "@/lib/deck-file-name";
import { Spinner } from "@/components/admin/ui";

type DeckUrlResult = { success: true; url: string; fileName?: string } | { success: false; error: string };

/**
 * The uploaded-deck panel on the admin/judge team page: filename, upload
 * date, a download link, and the deck itself rendered inline via iframe.
 */
export function DeckPanel({ deckPath, uploadedAt }: { deckPath: string; uploadedAt: string }) {
  return (
    <DeckViewer
      loadKey={deckPath}
      load={() => getDeckDownloadUrl(deckPath)}
      fileName={deckFileName(deckPath)}
      uploadedAt={uploadedAt}
    />
  );
}

/**
 * Shared deck viewer. `load` mints the short-lived signed URL (admins/judges
 * by deck path, volunteers by registration id); it's re-run when `loadKey`
 * changes. PDFs render inline; browsers can't preview PPTX, so those get a
 * download prompt instead of a blank frame.
 */
export function DeckViewer({
  loadKey,
  load,
  fileName: knownFileName,
  uploadedAt,
  notice,
}: {
  loadKey: string;
  load: () => Promise<DeckUrlResult>;
  fileName?: string;
  uploadedAt: string;
  /** Shown between the header row and the deck. */
  notice?: ReactNode;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; url: string; fileName?: string } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await load().catch(() => ({ success: false as const, error: "Could not load the deck." }));
      if (cancelled) return;
      if (!result.success) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "ready", url: result.url, fileName: result.fileName });
    })();
    return () => {
      cancelled = true;
    };
    // load is re-created each render; loadKey identifies the deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const fileName = knownFileName ?? (state.status === "ready" ? state.fileName : undefined);
  const isPptx = fileName?.toLowerCase().endsWith(".pptx") ?? false;

  const uploadedLabel = new Date(uploadedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-ignite-edge/[0.08] bg-ignite-surface p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">Uploaded deck</span>
          <span className="text-[15px] font-semibold text-ignite-ink">{fileName ?? "—"}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="font-ui text-[12px] text-ignite-muted">uploaded {uploadedLabel}</span>
          {state.status === "ready" && (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b-[1.5px] border-ignite-ink/35 pb-0.5 text-[14px] font-semibold text-ignite-ink transition-colors hover:border-ignite-magenta hover:text-ignite-magenta"
            >
              Download ↗
            </a>
          )}
        </div>
      </div>
      {notice}
      <div className="h-[520px] overflow-hidden rounded-[10px] border border-ignite-edge/[0.07] bg-ignite-bg">
        {state.status === "loading" && (
          <div className="flex h-full items-center justify-center gap-2.5 text-[14px] text-ignite-muted">
            <Spinner />
            Loading deck…
          </div>
        )}
        {state.status === "error" && (
          <div className="flex h-full items-center justify-center text-[14px] text-ignite-danger">{state.message}</div>
        )}
        {state.status === "ready" &&
          (isPptx ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[14px] text-ignite-muted">
              <span>PowerPoint files can&apos;t be previewed in the browser.</span>
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-ignite-primary px-5 py-2.5 font-ui text-[14px] font-bold text-ignite-on-primary transition-colors hover:bg-ignite-primary-hover"
              >
                Download PPTX to view
              </a>
            </div>
          ) : (
            <iframe src={state.url} title="Uploaded deck" className="h-full w-full border-0" />
          ))}
      </div>
    </div>
  );
}
