"use client";

import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Zip, ZipPassThrough, ZipDeflate } from "fflate";
import { logJudgingReportsZip } from "@/app/actions/judging";
import { openSaveTarget, ZipProgressPanel, type ZipProgress } from "./team-reports";
import { csvField } from "@/lib/csv";
import { reportFileBase } from "@/lib/report-file-name";
import { REGISTRATION_STATUS_LABELS } from "@/lib/registration-status";
import { formatScore, judgeProgress, JUDGE_PROGRESS_LABELS, summariseTeam, type JudgingTeam } from "@/lib/judging";

/**
 * Judging report downloads (the PDFs are built on the server — see
 * lib/judging-report.ts and app/(admin)/dashboard/judging-report/[teamId]/route.ts).
 * The zip is built here in the browser, a few teams at a time, like the
 * team reports zip (components/admin/team-reports.tsx).
 */

async function fetchJudgingReport(teamId: string, opts: { single?: boolean; signal?: AbortSignal } = {}) {
  const res = await fetch(`/dashboard/judging-report/${teamId}${opts.single ? "?single=1" : ""}`, { cache: "no-store", signal: opts.signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Couldn't build the judging report.");
  }
  const fileName = decodeURIComponent(res.headers.get("X-File-Name") ?? "judging-report.pdf");
  return { fileName, bytes: new Uint8Array(await res.arrayBuffer()) };
}

function saveBytes(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "Judging report (PDF)" on a team's page. */
export function JudgingReportButton({ teamId, className }: { teamId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { fileName, bytes } = await fetchJudgingReport(teamId, { single: true });
      saveBytes(bytes, fileName, "application/pdf");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build the judging report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={download} disabled={busy} className={className}>
      {busy ? "Building report…" : "Judging report (PDF)"}
    </button>
  );
}

/** One row per team, with each judge's score — goes in the zip next to the PDFs. */
export function judgingSummaryCsv(teams: JudgingTeam[]): string {
  const maxJudges = Math.max(1, ...teams.map((t) => t.assignments.length));
  const header = [
    "Team Id",
    "Team Name",
    "Track",
    "Registration Status",
    "Judges Assigned",
    "Scores Submitted",
    ...Array.from({ length: maxJudges }, (_, i) => [`Judge ${i + 1}`, `Judge ${i + 1} Progress`, `Judge ${i + 1} Score`]).flat(),
    "Total Score",
    "Avg Score",
    "Score Spread",
  ];
  const rows = teams.map((t) => {
    const s = summariseTeam(t);
    const judgeCells = Array.from({ length: maxJudges }, (_, i) => {
      const a = t.assignments[i];
      if (!a) return ["", "", ""];
      const score = t.scores.find((x) => x.judgeId === a.judgeId && x.status === "submitted");
      return [a.judgeName, JUDGE_PROGRESS_LABELS[judgeProgress(t.scores, a.judgeId)], score ? formatScore(score.weighted, 2) : ""];
    }).flat();
    return [
      t.entryCode,
      t.name,
      t.theme,
      REGISTRATION_STATUS_LABELS[t.status] ?? t.status,
      String(s.assigned),
      String(s.submitted),
      ...judgeCells,
      s.submitted ? formatScore(s.total, 2) : "",
      s.avg !== null ? formatScore(s.avg, 2) : "",
      s.spread !== null ? formatScore(s.spread, 2) : "",
    ];
  });
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\n");
}

const PARALLEL = 4;

/** `start(teams)` builds and saves a zip of these teams' judging reports; render `panel` once on the page. */
export function useJudgingReportsZip(): { start: (teams: JudgingTeam[]) => Promise<void>; running: boolean; panel: ReactNode } {
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start(teams: JudgingTeam[]) {
    if (abortRef.current) return;
    if (teams.length === 0) {
      toast.message("No team has judges assigned yet.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const folder = `gIGNITE-judging-reports-${today}`;
    const target = await openSaveTarget(`${folder}.zip`);
    if (!target) return;

    const abort = new AbortController();
    abortRef.current = abort;
    const total = teams.length;
    const label = "judging reports";
    setProgress({ label, done: 0, total, failed: 0 });

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
    const addFile = (name: string, bytes: Uint8Array, compress = false) => {
      const file = compress ? new ZipDeflate(`${folder}/${name}`, { level: 6 }) : new ZipPassThrough(`${folder}/${name}`);
      zip.add(file);
      file.push(bytes, true);
    };

    const failures: string[] = [];
    let done = 0;
    let next = 0;
    async function worker() {
      while (!abort.signal.aborted) {
        const team = teams[next++];
        if (!team) return;
        try {
          const { fileName, bytes } = await fetchJudgingReport(team.id, { signal: abort.signal });
          addFile(`Judging reports/${fileName}`, bytes);
        } catch (err) {
          if (abort.signal.aborted) return;
          failures.push(`${reportFileBase(team.name, team.entryCode)}: ${err instanceof Error ? err.message : "failed"}`);
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
      addFile("Judging summary.csv", new TextEncoder().encode(judgingSummaryCsv(teams)), true);
      if (failures.length > 0) {
        addFile(
          "_teams-not-included.txt",
          new TextEncoder().encode(`These teams' judging reports couldn't be built — download them one at a time from each team's page:\n\n${failures.join("\n")}\n`),
          true,
        );
      }
      zip.end();
      await zipDone;
      if (zipError) throw zipError;
      await target.finish();
      void logJudgingReportsZip(total - failures.length).catch(() => undefined);
      if (failures.length > 0) {
        toast.error(`Zip saved with ${total - failures.length} of ${total} teams. See _teams-not-included.txt inside for the rest.`);
      } else {
        toast.success(`Zip saved: ${total} judging report${total === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      await target.abort().catch(() => undefined);
      toast.error(err instanceof Error ? `The zip couldn't be saved: ${err.message}` : "The zip couldn't be saved.");
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  const panel = progress ? <ZipProgressPanel progress={progress} onCancel={() => abortRef.current?.abort()} /> : null;
  return { start, running: progress !== null, panel };
}
