"use client";

import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Zip, ZipPassThrough } from "fflate";
import { listTeamsForReports } from "@/app/actions/admin";
import { Spinner } from "@/components/admin/ui";

/**
 * Team report downloads for admins (reports are built on the server, see
 * lib/team-report.ts and app/(admin)/dashboard/team-report/[teamId]/route.ts).
 *
 * The zip downloads build the zip here in the browser, a few teams at a
 * time: each team's report goes in a "Team reports" folder and its deck
 * (PDF or PowerPoint, as uploaded) in a "Pitch decks" folder, both named
 * "TeamName-GIG-XXXXXX". Where
 * the browser can (Chrome, Edge), the zip is written straight to the file
 * chosen in the save dialog; elsewhere it's kept in memory, then saved.
 */

type ReportLinks = { fileBase: string; pdfUrl: string; deck: { url: string; fileName: string } | null };

async function fetchReportLinks(teamId: string, single = false): Promise<ReportLinks> {
  const res = await fetch(`/dashboard/team-report/${teamId}${single ? "?single=1" : ""}`, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.pdfUrl) throw new Error(body?.error ?? "Couldn't build the report.");
  return body as ReportLinks;
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Starts a browser download of `url` (a signed link that names the file). */
function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------

/** "Download team report (PDF)" on a team's page. */
export function TeamReportButton({ teamId, className }: { teamId: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const links = await fetchReportLinks(teamId, true);
      triggerDownload(links.pdfUrl);
      if (links.deck) {
        toast.message("The pitch deck is a separate file.", {
          action: { label: "Download deck", onClick: () => triggerDownload(links.deck!.url) },
          duration: 15000,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={download} disabled={busy} className={className}>
      {busy ? "Building report…" : "Download team report (PDF)"}
    </button>
  );
}

// ---------------------------------------------------------------------------

type SaveTarget = { write: (chunk: Uint8Array) => Promise<void>; finish: () => Promise<void>; abort: () => Promise<void> };

type FileHandleWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (d: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }>;
};

/** Where the zip goes: the file picked in the save dialog, or memory then a normal download. Null if cancelled. */
async function openSaveTarget(fileName: string): Promise<SaveTarget | null> {
  const w = window as FileHandleWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "Zip file", accept: { "application/zip": [".zip"] } }],
      });
      const writable = await handle.createWritable();
      return { write: (c) => writable.write(c), finish: () => writable.close(), abort: () => writable.abort() };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Picker unavailable here (e.g. blocked) — fall back to memory.
    }
  }
  const chunks: Uint8Array[] = [];
  return {
    write: async (c) => {
      chunks.push(c);
    },
    finish: async () => {
      const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    abort: async () => {
      chunks.length = 0;
    },
  };
}

const PARALLEL = 3;

type Progress = { label: string; done: number; total: number; failed: number };

/**
 * `start()` builds and saves a zip of team reports; render `panel` once on
 * the page for the progress card. One zip at a time per hook.
 */
export function useTeamReportsZip(): { start: (scope: "all" | "shortlist") => Promise<void>; running: boolean; panel: ReactNode } {
  const [progress, setProgress] = useState<Progress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start(scope: "all" | "shortlist") {
    if (abortRef.current) return;
    const label = scope === "all" ? "all teams" : "finale shortlist";
    const listed = await listTeamsForReports(scope).catch(() => ({ success: false as const, error: "No connection — try again." }));
    if (!listed.success) {
      toast.error(listed.error);
      return;
    }
    if (listed.teams.length === 0) {
      toast.message(scope === "all" ? "No teams have registered yet." : "No teams are shortlisted.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const folder = `gIGNITE-${scope === "all" ? "all-teams" : "finale-shortlist"}-${today}`;
    const target = await openSaveTarget(`${folder}.zip`);
    if (!target) return;

    const abort = new AbortController();
    abortRef.current = abort;
    const total = listed.teams.length;
    setProgress({ label, done: 0, total, failed: 0 });

    // Zip chunks are written in order, one write at a time.
    let writing = Promise.resolve();
    let zipError: Error | null = null;
    let finished!: () => void;
    const zipDone = new Promise<void>((resolve) => (finished = resolve));
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        zipError = err;
        finished();
        return;
      }
      writing = writing.then(() => target.write(chunk));
      if (final) writing.then(finished, (e) => ((zipError = e), finished()));
    });
    // PDFs are already compressed: store them as they are (much faster).
    const addFile = (name: string, bytes: Uint8Array) => {
      const file = new ZipPassThrough(`${folder}/${name}`);
      zip.add(file);
      file.push(bytes, true);
    };

    const failures: string[] = [];
    let done = 0;
    let next = 0;
    async function worker() {
      while (!abort.signal.aborted) {
        const team = listed.success ? listed.teams[next++] : undefined;
        if (!team) return;
        try {
          const links = await fetchReportLinks(team.id);
          const pdf = await fetchBytes(links.pdfUrl, abort.signal);
          const deck = links.deck ? await fetchBytes(links.deck.url, abort.signal) : null;
          addFile(`Team reports/${links.fileBase}.pdf`, pdf);
          if (deck && links.deck) addFile(`Pitch decks/${links.deck.fileName}`, deck);
        } catch (err) {
          if (abort.signal.aborted) return;
          failures.push(`${team.fileBase}: ${err instanceof Error ? err.message : "failed"}`);
        }
        done += 1;
        setProgress({ label, done, total, failed: failures.length });
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
      if (abort.signal.aborted) {
        await writing.catch(() => undefined);
        await target.abort();
        toast.message("Download cancelled.");
        return;
      }
      if (failures.length > 0) {
        addFile(
          "_teams-not-included.txt",
          new TextEncoder().encode(`These teams' reports couldn't be built — download them one at a time from each team's page:\n\n${failures.join("\n")}\n`),
        );
      }
      zip.end();
      await zipDone;
      if (zipError) throw zipError;
      await target.finish();
      if (failures.length > 0) {
        toast.error(`Zip saved with ${total - failures.length} of ${total} teams. See _teams-not-included.txt inside for the rest.`);
      } else {
        toast.success(`Zip saved: ${total} team report${total === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      await target.abort().catch(() => undefined);
      toast.error(err instanceof Error ? `The zip couldn't be saved: ${err.message}` : "The zip couldn't be saved.");
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  const panel = progress ? (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex w-[300px] flex-col gap-2.5 rounded-2xl border border-ignite-edge/[0.12] bg-ignite-surface p-4 font-ui shadow-2xl"
    >
      <div className="flex items-center gap-2 text-[14px] font-semibold text-ignite-ink">
        <Spinner />
        Building zip — {progress.label}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ignite-lavender">
        <div
          className="h-full rounded-full bg-ignite-primary transition-[width]"
          style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] text-ignite-muted">
        <span>
          {progress.done} of {progress.total} teams{progress.failed > 0 ? ` · ${progress.failed} failed` : ""}
        </span>
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="font-semibold text-ignite-ink hover:text-ignite-danger"
        >
          Cancel
        </button>
      </div>
      <span className="text-[11px] leading-[1.45] text-ignite-muted">Keep this tab open until it finishes.</span>
    </div>
  ) : null;

  return { start, running: progress !== null, panel };
}
