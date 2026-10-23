"use client";

import { useState } from "react";
import { toast } from "sonner";
import { exportDeckCsv, exportFinaleShortlistCsv, exportRegistrationsCsv } from "@/app/actions/admin";
import { downloadCsv } from "@/lib/csv-download";
import { useTeamReportsZip } from "./team-reports";
import { Panel, SecondaryButton } from "@/components/admin/ui";

type CsvKind = "all" | "finale" | "deck" | "finale-deck";

const CSV_EXPORTS: Record<CsvKind, () => ReturnType<typeof exportRegistrationsCsv>> = {
  all: exportRegistrationsCsv,
  finale: exportFinaleShortlistCsv,
  deck: () => exportDeckCsv("all"),
  "finale-deck": () => exportDeckCsv("shortlist"),
};

type Row = {
  label: string;
  contents: string;
  /** Finale shortlist downloads only work once the results are published. */
  shortlist: boolean;
} & ({ csv: CsvKind } | { zip: "all" | "shortlist" });

const ROWS: Row[] = [
  {
    label: "Export teams CSV",
    contents: "Every team: name and ID, leader and members with phone numbers, college and track.",
    shortlist: false,
    csv: "all",
  },
  {
    label: "Export finale shortlist CSV",
    contents: "The same sheet for the teams shortlisted for the Grand Finale.",
    shortlist: true,
    csv: "finale",
  },
  {
    label: "Download deck CSV",
    contents: "Every team's idea answers: the problem, solution, AI + tech and impact, with team name and ID.",
    shortlist: false,
    csv: "deck",
  },
  {
    label: "Download shortlisted deck CSV",
    contents: "The same idea answers for the teams shortlisted for the Grand Finale.",
    shortlist: true,
    csv: "finale-deck",
  },
  {
    label: "Download zip files for all teams",
    contents: "A Team reports folder (one PDF per team) and a Pitch decks folder, both named TeamName-TeamID.",
    shortlist: false,
    zip: "all",
  },
  {
    label: "Download zip files for shortlisted teams",
    contents: "The same zip for the teams shortlisted for the Grand Finale.",
    shortlist: true,
    zip: "shortlist",
  },
];

/** Admin only (the page checks the role; each server action checks again). */
export function TeamDownloads({ resultsPublished }: { resultsPublished: boolean }) {
  const [exporting, setExporting] = useState<CsvKind | null>(null);
  const reportsZip = useTeamReportsZip();

  async function handleCsv(kind: CsvKind) {
    setExporting(kind);
    const result = await CSV_EXPORTS[kind]().catch(() => ({ success: false as const, error: "No connection — try again." }));
    setExporting(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    downloadCsv(result.csv, result.filename);
  }

  return (
    <div className="flex flex-col gap-4">
      {reportsZip.panel}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-ignite-edge/[0.12] text-left font-ui text-[12px] font-bold uppercase tracking-[0.12em] text-ignite-muted">
              <th className="px-4 py-3">Download</th>
              <th className="px-4 py-3">What&apos;s in it</th>
              <th className="px-4 py-3">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const locked = row.shortlist && !resultsPublished;
              const busy = "csv" in row ? exporting === row.csv : reportsZip.running;
              return (
                <tr key={row.label} className="border-b border-ignite-edge/[0.07] last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ignite-ink">{row.label}</td>
                  <td className="px-4 py-3 text-ignite-muted">
                    {row.contents}
                    {locked && <span className="mt-1 block text-[12px]">Available once the results are published.</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SecondaryButton
                      type="button"
                      onClick={() => ("csv" in row ? handleCsv(row.csv) : reportsZip.start(row.zip))}
                      disabled={locked || ("csv" in row ? exporting !== null : reportsZip.running)}
                    >
                      {busy ? ("csv" in row ? "Exporting…" : "Building zip…") : "Download"}
                    </SecondaryButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
