"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAuditLogs, type AuditLogEntry, type AuditLogRange } from "@/app/actions/audit-log";
import { Panel, Skeleton, Spinner } from "@/components/admin/ui";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { value: AuditLogRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "120", label: "Last 120 days" },
];

const ACTION_LABELS: Record<string, string> = {
  "team.registered": "Registered a team",
  "registration.status_changed": "Changed registration status",
  "registration.verification_changed": "Changed eligibility verification",
  "judge.assigned": "Assigned a judge",
  "judge.unassigned": "Removed a judge assignment",
  "judge.score_submitted": "Submitted a score",
  "staff.created": "Created a staff account",
  "registrations.exported": "Exported registrations CSV",
  "auth.signed_in": "Signed in",
  "auth.password_reset": "Reset their password",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatWhen(dateString: string): string {
  return new Date(dateString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function detailSummary(entry: AuditLogEntry): string | null {
  const meta = entry.metadata ?? {};
  const parts: string[] = [];
  if (entry.target_label) parts.push(entry.target_label);
  if (typeof meta.status === "string") parts.push(`→ ${meta.status}`);
  if (typeof meta.role === "string") parts.push(`as ${roleLabel(meta.role)}`);
  if (typeof meta.ai_theme === "string") parts.push(String(meta.ai_theme));
  if (typeof meta.teamCount === "number") parts.push(`${meta.teamCount} teams`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function AuditLogViewer() {
  const [range, setRange] = useState<AuditLogRange>("7");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAuditLogs(range).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLogs(result.logs);
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={cn(
              "rounded-[8px] border-[1.5px] px-3 py-1.5 font-ui text-[13px] font-semibold transition-colors",
              range === opt.value
                ? "border-ignite-ink bg-ignite-lavender text-ignite-ink"
                : "border-ignite-edge/[0.12] text-ignite-muted hover:text-ignite-ink",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Panel className="flex flex-col gap-3 p-4" role="status" aria-live="polite">
          <span className="flex items-center gap-2 text-[14px] text-ignite-muted">
            <Spinner className="h-3.5 w-3.5" />
            Loading activity…
          </span>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Panel>
      ) : logs.length === 0 ? (
        <Panel className="py-10 text-center text-[14px] text-ignite-muted">No activity in this window.</Panel>
      ) : (
        <>
          <span className="font-ui text-[12px] text-ignite-muted">
            {logs.length} event{logs.length === 1 ? "" : "s"}
          </span>
          <Panel className="overflow-x-auto">
            <div className="flex min-w-[760px] flex-col divide-y divide-ignite-edge/[0.07]">
              <div className="grid grid-cols-[150px_180px_1fr_1.2fr] gap-3 px-4 py-2.5">
                <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">When</span>
                <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">Who</span>
                <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">Activity</span>
                <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">Details</span>
              </div>
              {logs.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[150px_180px_1fr_1.2fr] items-start gap-3 px-4 py-3 text-[13px]">
                  <span className="font-ui text-[12px] text-ignite-muted">{formatWhen(entry.created_at)}</span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold text-ignite-ink">{entry.actor_label}</span>
                    <span className="font-ui text-[11px] uppercase tracking-[0.08em] text-ignite-muted">
                      {roleLabel(entry.actor_role)}
                    </span>
                  </div>
                  <span className="text-ignite-ink-soft">{actionLabel(entry.action)}</span>
                  <span className="truncate text-ignite-muted">{detailSummary(entry) ?? "—"}</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
