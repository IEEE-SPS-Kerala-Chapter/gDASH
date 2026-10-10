"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAmbassadors, importAmbassadorSheet, type AmbassadorRankingRow } from "@/app/actions/ambassadors";
import { formatAmbassadorId } from "@/lib/ambassador";
import { AMBASSADOR_SHEET_TEMPLATE, parseAmbassadorSheet, type ParsedSheet } from "@/lib/ambassador-sheet";
import { downloadCsv } from "@/lib/csv-download";
import { Panel, PrimaryButton, SecondaryButton, SectionLabel } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

type PreviewRow = {
  number: number;
  line: number;
  name: string;
  college: string;
  error: string | null;
  kind: "new" | "same" | "changed";
  previous: string | null;
  /** Teams that already picked this ID — set only when its name changes. */
  referralsAffected: number;
};

/**
 * Super-admin: upload a CSV of ambassadors (Name, College). Row order sets
 * the IDs — first row AMGIG-00, then AMGIG-01, … — and nothing is saved
 * until the preview is confirmed.
 */
export function AmbassadorSheetImport({ rows: current }: { rows: AmbassadorRankingRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const activeCount = current.filter((r) => !r.deleted).length;
  const referredTotal = current.reduce((sum, r) => sum + r.total, 0);

  async function deleteAll() {
    setDeletingAll(true);
    const result = await deleteAmbassadors("all").catch(() => ({
      success: false as const,
      error: "No connection — nothing was deleted.",
    }));
    setDeletingAll(false);
    setConfirmingDeleteAll(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("All ambassadors deleted.");
    router.refresh();
  }

  const byNumber = new Map(current.map((r) => [r.number, r]));
  const preview: PreviewRow[] = (sheet?.rows ?? []).map((row, i) => {
    const existing = byNumber.get(i);
    const prevName = existing?.name ?? null;
    const prevCollege = existing?.college ?? null;
    const kind =
      existing?.deleted || (!prevName && !prevCollege)
        ? "new"
        : prevName === row.name && (prevCollege ?? "") === row.college
          ? "same"
          : "changed";
    return {
      number: i,
      line: row.line,
      name: row.name,
      college: row.college,
      error: row.error,
      kind,
      previous: kind === "changed" ? [prevName, prevCollege].filter(Boolean).join(" · ") : null,
      referralsAffected: prevName && prevName !== row.name ? (existing?.total ?? 0) : 0,
    };
  });
  const errors = preview.filter((r) => r.error);
  const affected = preview.filter((r) => r.referralsAffected > 0);
  const counts = {
    new: preview.filter((r) => r.kind === "new").length,
    changed: preview.filter((r) => r.kind === "changed").length,
    same: preview.filter((r) => r.kind === "same").length,
  };
  const canImport = Boolean(sheet && !sheet.error && errors.length === 0 && preview.length > 0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("That file is too big for an ambassador list (1 MB max).");
      return;
    }
    setFileName(file.name);
    setSheet(parseAmbassadorSheet(await file.text()));
  }

  function reset() {
    setSheet(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmImport() {
    if (!sheet) return;
    setImporting(true);
    const result = await importAmbassadorSheet(sheet.rows.map((r) => ({ name: r.name, college: r.college }))).catch(
      () => ({ success: false as const, error: "No connection — nothing was saved." }),
    );
    setImporting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Imported ${result.imported} ambassador${result.imported === 1 ? "" : "s"} as AMGIG-00 to ${formatAmbassadorId(result.imported - 1)}.`,
    );
    reset();
    router.refresh();
  }

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <SectionLabel>Import from a sheet</SectionLabel>
      <span className="text-[13px] leading-[1.5] text-ignite-muted">
        Upload a CSV with <b>Name</b> and <b>College</b> columns (in Google Sheets: File → Download → CSV). The first
        ambassador becomes AMGIG-00, the next AMGIG-01, and so on in sheet order. IDs after the last row keep their
        current details, and the ID range is raised if the sheet needs more IDs. You&apos;ll see a preview before
        anything is saved.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <SecondaryButton type="button" onClick={() => fileRef.current?.click()} disabled={importing}>
          {fileName ? "Choose a different file" : "Upload CSV"}
        </SecondaryButton>
        <SecondaryButton
          type="button"
          onClick={() => downloadCsv(AMBASSADOR_SHEET_TEMPLATE, "gignite-ambassadors-template.csv")}
        >
          Download template
        </SecondaryButton>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingDeleteAll(true)}
            disabled={importing}
            className="rounded-full border border-ignite-danger/60 px-5 py-2.5 font-ui text-[14px] font-semibold text-ignite-danger transition-colors hover:bg-ignite-danger hover:text-white disabled:opacity-60"
          >
            Delete all ambassadors
          </button>
        )}
        {fileName && <span className="font-ui text-[13px] text-ignite-muted">{fileName}</span>}
      </div>
      {confirmingDeleteAll && (
        <ConfirmDialog
          title="Delete all ambassadors?"
          confirmLabel={`Yes, delete all ${activeCount}`}
          busy={deletingAll}
          onConfirm={deleteAll}
          onCancel={() => setConfirmingDeleteAll(false)}
        >
          <p className="m-0">
            All {activeCount} ambassador{activeCount === 1 ? "" : "s"} will be removed from the registration form, and
            the &ldquo;Referred by an ambassador?&rdquo; question will be hidden until you import a new sheet.
          </p>
          {referredTotal > 0 && (
            <p className="m-0">
              {referredTotal} team{referredTotal === 1 ? " has" : "s have"} already picked an ambassador — those
              referrals are kept.
            </p>
          )}
        </ConfirmDialog>
      )}

      {sheet?.error && <p className="m-0 text-[14px] font-semibold text-ignite-danger">{sheet.error}</p>}

      {sheet && !sheet.error && (
        <div className="flex flex-col gap-3">
          <span className="font-ui text-[14px] text-ignite-ink">
            {preview.length} ambassador{preview.length === 1 ? "" : "s"} → AMGIG-00 to{" "}
            {formatAmbassadorId(preview.length - 1)} · {counts.new} new · {counts.changed} changed · {counts.same}{" "}
            unchanged
          </span>
          {errors.length > 0 && (
            <p className="m-0 text-[14px] font-semibold text-ignite-danger">
              {errors.length} row{errors.length === 1 ? " has" : "s have"} a problem (marked below). Fix the sheet and
              upload it again — rows can&apos;t be skipped, since each row&apos;s position sets its ID.
            </p>
          )}
          {affected.length > 0 && (
            <p className="m-0 rounded-xl bg-ignite-warn-pale px-3 py-2 text-[14px] text-ignite-warn">
              <b>Check before importing:</b>{" "}
              {affected
                .map((r) => `${formatAmbassadorId(r.number)} (${r.referralsAffected} team${r.referralsAffected === 1 ? "" : "s"})`)
                .join(", ")}{" "}
              already {affected.length === 1 ? "has" : "have"} referrals and will get a different name. Those teams will
              then count as referred by the new person.
            </p>
          )}
          <div className="max-h-[420px] overflow-auto rounded-xl border border-ignite-edge/[0.08]">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead className="sticky top-0 bg-ignite-surface">
                <tr className="border-b border-ignite-edge/[0.12] text-left font-ui text-[12px] font-bold uppercase tracking-[0.12em] text-ignite-muted">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">College</th>
                  <th className="px-3 py-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.number} className={cn("border-b border-ignite-edge/[0.06]", r.error && "bg-ignite-danger-pale")}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold tracking-[0.04em] text-ignite-ink">
                      {formatAmbassadorId(r.number)}
                    </td>
                    <td className="px-3 py-2 text-ignite-ink">{r.name || <span className="text-ignite-faint">—</span>}</td>
                    <td className="px-3 py-2 text-ignite-ink-soft">
                      {r.college || <span className="text-ignite-faint">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[13px]">
                      {r.error ? (
                        <span className="font-semibold text-ignite-danger">
                          Line {r.line}: {r.error}
                        </span>
                      ) : r.kind === "new" ? (
                        <span className="text-ignite-success">New</span>
                      ) : r.kind === "same" ? (
                        <span className="text-ignite-muted">Unchanged</span>
                      ) : (
                        <span className="text-ignite-warn">Replaces {r.previous}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <PrimaryButton type="button" onClick={confirmImport} disabled={!canImport || importing} loading={importing}>
                {importing ? "Importing…" : `Import ${preview.length} ambassador${preview.length === 1 ? "" : "s"}`}
              </PrimaryButton>
            </div>
            <SecondaryButton type="button" onClick={reset} disabled={importing}>
              Cancel
            </SecondaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
