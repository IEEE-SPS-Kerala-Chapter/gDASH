"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  exportAttendanceCsv,
  setScan,
  type AttendanceData,
  type AttendanceMember,
  type AttendanceScan,
} from "@/app/actions/attendance";
import { Panel, PrimaryButton, SecondaryButton, Select, TextInput } from "@/components/admin/ui";
import { downloadCsv } from "@/lib/csv-download";
import { cn } from "@/lib/utils";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Pending = {
  member: AttendanceMember;
  teamName: string;
  checkpoint: AttendanceData["checkpoints"][number];
  present: boolean;
};

/**
 * Admin-only: every shortlisted participant × every check-in point. Click a
 * cell to mark someone manually (e.g. a scan that failed) or remove a wrong
 * scan — works even after a meal has closed. Changes show immediately and
 * are put back if saving fails.
 */
export function AttendanceTable({ data }: { data: AttendanceData }) {
  const [teams, setTeams] = useState(data.teams);
  useEffect(() => setTeams(data.teams), [data.teams]);
  const { checkpoints } = data;

  const [search, setSearch] = useState("");
  const [missingFor, setMissingFor] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams
      .map((t) => {
        const teamMatches = !q || t.name.toLowerCase().includes(q) || t.entryCode.toLowerCase().includes(q);
        const members = t.members.filter((m) => {
          if (missingFor && m.scans[missingFor]) return false;
          if (!q || teamMatches) return true;
          return m.fullName.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q);
        });
        return { ...t, members };
      })
      .filter((t) => t.members.length > 0);
  }, [teams, search, missingFor]);

  const shownPeople = filtered.reduce((n, t) => n + t.members.length, 0);
  const totalPeople = teams.reduce((n, t) => n + t.members.length, 0);

  function applyScan(memberId: string, checkpointId: string, scan: AttendanceScan | null) {
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) => {
          if (m.id !== memberId) return m;
          const scans = { ...m.scans };
          if (scan) scans[checkpointId] = scan;
          else delete scans[checkpointId];
          return { ...m, scans };
        }),
      })),
    );
  }

  async function confirm() {
    if (!pending) return;
    const { member, checkpoint, present } = pending;
    const previous = member.scans[checkpoint.id] ?? null;
    setSaving(true);
    applyScan(member.id, checkpoint.id, present ? { at: new Date().toISOString(), byName: "You" } : null);
    const result = await setScan(checkpoint.id, member.id, present).catch(() => ({
      success: false as const,
      error: "No connection — nothing was changed.",
    }));
    setSaving(false);
    setPending(null);
    if (result.success) {
      applyScan(member.id, checkpoint.id, result.scan);
      toast.success(present ? `Marked ${member.fullName} — ${checkpoint.label}.` : `Removed ${member.fullName}'s ${checkpoint.label} scan.`);
    } else {
      applyScan(member.id, checkpoint.id, previous);
      toast.error(result.error);
    }
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportAttendanceCsv();
    setExporting(false);
    if (result.success) downloadCsv(result.csv, result.filename);
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, member or member code" />
        <Select
          value={missingFor}
          onChange={(e) => setMissingFor(e.target.value)}
          className={cn("w-full py-[9px] text-[13.5px] font-semibold sm:w-auto", missingFor ? "border-ignite-ink text-ignite-ink" : "text-ignite-ink-soft")}
        >
          <option value="">Everyone</option>
          {checkpoints.map((c) => (
            <option key={c.id} value={c.id}>
              Not yet: {c.label}
            </option>
          ))}
        </Select>
        <div className="w-full sm:w-auto sm:flex-none">
          <SecondaryButton type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </SecondaryButton>
        </div>
      </div>
      <span className="-mt-2 font-ui text-[12px] text-ignite-muted">
        {shownPeople} of {totalPeople} participants shown · click a cell to mark or remove
      </span>

      {filtered.length === 0 ? (
        <Panel className="py-10 text-center text-[14px] text-ignite-muted">
          {teams.length === 0 ? "No shortlisted teams yet." : "Nobody matches your search or filter."}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-ignite-edge/[0.12]">
                <th className="sticky left-0 bg-ignite-surface px-4 py-3 text-left font-ui text-[12px] font-bold uppercase tracking-[0.12em] text-ignite-muted">
                  Participant
                </th>
                {checkpoints.map((c) => (
                  <th key={c.id} className="px-3 py-3 text-left font-ui text-[12px] font-bold uppercase tracking-[0.1em] text-ignite-muted">
                    {c.kind === "venue" ? "📍 " : "🍽️ "}
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <Fragment key={t.id}>
                  <tr className="bg-ignite-bg/60">
                    <td colSpan={checkpoints.length + 1} className="px-4 py-2 font-display text-[14px] font-semibold text-ignite-ink">
                      {t.name} <span className="ml-1 text-[12px] font-bold tracking-[0.04em] text-ignite-muted">{t.entryCode}</span>
                    </td>
                  </tr>
                  {t.members.map((m) => (
                    <tr key={m.id} className="border-b border-ignite-edge/[0.06]">
                      <td className="sticky left-0 bg-ignite-surface px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-ignite-ink">
                            {m.fullName}
                            {m.isLeader && <span className="ml-1.5 text-[11px] font-bold text-ignite-magenta">Leader</span>}
                          </span>
                          <span className="text-[11px] font-bold tracking-[0.04em] text-ignite-muted">{m.memberCode}</span>
                        </div>
                      </td>
                      {checkpoints.map((c) => {
                        const scan = m.scans[c.id];
                        return (
                          <td key={c.id} className="px-2 py-1.5">
                            <button
                              type="button"
                              title={scan ? `Scanned by ${scan.byName ?? "unknown"} — click to remove` : "Click to mark manually"}
                              onClick={() => setPending({ member: m, teamName: t.name, checkpoint: c, present: !scan })}
                              className={cn(
                                "w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                                scan
                                  ? "bg-ignite-success-pale font-semibold text-ignite-success hover:bg-ignite-success-pale/70"
                                  : "text-ignite-faint hover:bg-ignite-lavender hover:text-ignite-ink",
                              )}
                            >
                              {scan ? `✓ ${timeLabel(scan.at)}` : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !saving && setPending(null)}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-ignite-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="m-0 font-display text-[17px] font-semibold text-ignite-ink">
              {pending.present
                ? pending.checkpoint.kind === "venue"
                  ? `Mark ${pending.member.fullName} as checked in?`
                  : `Mark ${pending.member.fullName} as served ${pending.checkpoint.label}?`
                : `Remove ${pending.member.fullName}'s ${pending.checkpoint.label} scan?`}
            </p>
            <p className="m-0 text-[13px] text-ignite-muted">
              {pending.teamName} · {pending.member.memberCode}. This is recorded in the audit log.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <PrimaryButton type="button" onClick={confirm} disabled={saving} loading={saving}>
                  {saving ? "Saving…" : pending.present ? "Mark" : "Remove"}
                </PrimaryButton>
              </div>
              <div className="flex-1">
                <SecondaryButton type="button" onClick={() => setPending(null)} disabled={saving}>
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
