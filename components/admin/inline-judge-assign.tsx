"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminAssignment, AdminJudge } from "@/app/actions/admin";
import { assignJudge, unassignJudge } from "@/app/actions/admin";

/**
 * Assign/unassign judges directly from a list or card row, without
 * navigating into the detail page. Stops click propagation so it can sit
 * inside a row/card that navigates on click elsewhere.
 */
export function InlineJudgeAssign({
  registrationId,
  assignments,
  judges,
  onChange,
}: {
  registrationId: string;
  assignments: AdminAssignment[];
  judges: AdminJudge[];
  onChange: (next: AdminAssignment[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const assignedIds = new Set(assignments.map((a) => a.judge_id));
  const available = judges.filter((j) => !assignedIds.has(j.id));

  async function handlePick(judgeId: string) {
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

  async function handleRemove(assignmentId: string) {
    const result = await unassignJudge(assignmentId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChange(assignments.filter((a) => a.id !== assignmentId));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {assignments.map((a) => (
        <Badge key={a.id} variant="secondary" className="gap-1 text-[10px]">
          {a.judge_name}
          <button
            type="button"
            aria-label={`Unassign ${a.judge_name}`}
            onClick={() => handleRemove(a.id)}
            className="text-muted-foreground hover:text-destructive"
          >
            ×
          </button>
        </Badge>
      ))}
      {available.length > 0 ? (
        <Select disabled={busy} onValueChange={handlePick} value="">
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue placeholder="+ Assign judge" />
          </SelectTrigger>
          <SelectContent>
            {available.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        judges.length === 0 &&
        assignments.length === 0 && <span className="text-xs text-muted-foreground">No judges yet</span>
      )}
    </div>
  );
}
