"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AdminAssignment, AdminJudge } from "@/app/actions/admin";
import { assignJudge, unassignJudge } from "@/app/actions/admin";
import { Badge, ChipButton } from "@/components/admin/ui";

/**
 * Assign/unassign judges directly from a list or card row, without
 * navigating into the detail page. Stops click propagation so it can sit
 * inside a row/card that navigates on click elsewhere.
 *
 * Unassigning shows an inline confirm panel (per the Claude Design file's
 * "gIGNITE Team Detail Page" spec) rather than a native browser confirm() —
 * it also tells the admin whether that judge has already scored the team,
 * since their score/comments stay on record either way.
 */
export function InlineJudgeAssign({
  registrationId,
  assignments,
  judges,
  scoredJudgeIds = [],
  onChange,
}: {
  registrationId: string;
  assignments: AdminAssignment[];
  judges: AdminJudge[];
  /** judge_ids who have already submitted a score for this registration — only used to word the unassign confirmation. */
  scoredJudgeIds?: string[];
  onChange: (next: AdminAssignment[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<AdminAssignment | null>(null);
  const assignedIds = new Set(assignments.map((a) => a.judge_id));
  const scoredIds = new Set(scoredJudgeIds);
  const available = judges.filter((j) => !assignedIds.has(j.id));

  async function handlePick(judgeId: string) {
    if (!judgeId) return;
    setBusy(true);
    const result = await assignJudge(registrationId, judgeId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const judge = judges.find((j) => j.id === judgeId);
    if (judge) {
      onChange([...assignments, { id: result.assignmentId, judge_id: judge.id, judge_name: judge.full_name }]);
    }
    toast.success("Judge assigned.");
  }

  async function handleConfirmedUnassign() {
    if (!confirming) return;
    const assignmentId = confirming.id;
    setConfirming(null);
    const result = await unassignJudge(assignmentId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChange(assignments.filter((a) => a.id !== assignmentId));
  }

  return (
    <div className="flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        {assignments.map((a) => (
          <Badge key={a.id} className="gap-1.5">
            {a.judge_name}
            <ChipButton tone="danger" ariaLabel={`Unassign ${a.judge_name}`} onClick={() => setConfirming(a)}>
              ×
            </ChipButton>
          </Badge>
        ))}
        {available.length > 0 ? (
          <select
            disabled={busy}
            value=""
            onChange={(e) => handlePick(e.target.value)}
            className="cursor-pointer rounded-full border-[1.5px] border-dashed border-gignite-border-strong bg-transparent px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gignite-blue outline-none transition-colors hover:border-gignite-blue disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="" disabled>
              + Assign judge
            </option>
            {available.map((j) => (
              <option key={j.id} value={j.id}>
                {j.full_name}
              </option>
            ))}
          </select>
        ) : (
          judges.length === 0 &&
          assignments.length === 0 && <span className="text-[12px] text-gignite-text/60">No judges yet</span>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-3 rounded-[10px] border-[1.5px] border-gignite-danger bg-gignite-card p-4">
          <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-gignite-danger text-[11px] font-bold text-white">
              !
            </span>
            <span className="flex-1 text-[14px] leading-[1.55] text-gignite-text">
              Unassign <span className="font-semibold text-black">{confirming.judge_name}</span> from this team?{" "}
              {scoredIds.has(confirming.judge_id)
                ? "Their submitted score and comments stay on the record."
                : "They have not scored this entry yet."}
            </span>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleConfirmedUnassign}
              className="flex-1 rounded-[9px] bg-gignite-danger px-4 py-2.5 font-heading text-[14px] font-medium text-white transition-colors hover:bg-[#98300F]"
            >
              Unassign
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="flex-1 rounded-[9px] border-[1.5px] border-gignite-border-strong bg-white px-4 py-2.5 font-heading text-[14px] font-medium text-gignite-text transition-colors hover:border-gignite-blue hover:text-gignite-blue"
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
