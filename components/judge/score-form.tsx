"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE1_CRITERIA, computeWeightedScore, type Stage1Scores } from "@/lib/scoring";
import { submitScore } from "@/app/actions/judge";
import type { AdminJudgeScore } from "@/app/actions/admin";

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function toStage1Scores(score: AdminJudgeScore | undefined): Stage1Scores {
  return {
    problem_relevance: score?.problemRelevance ?? 5,
    technical_implementation: score?.technicalImplementation ?? 5,
    innovation_creativity: score?.innovationCreativity ?? 5,
    feasibility_scalability: score?.feasibilityScalability ?? 5,
    completion_functionality: score?.completionFunctionality ?? 5,
  };
}

/** A judge's Stage 1 scoring form for one registration — prefilled from their existing score, if any. */
export function ScoreForm({ registrationId, existingScore }: { registrationId: string; existingScore?: AdminJudgeScore }) {
  const [scores, setScores] = useState<Stage1Scores>(toStage1Scores(existingScore));
  const [comments, setComments] = useState(existingScore?.comments ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(existingScore));

  async function handleSubmit() {
    setSaving(true);
    const result = await submitScore(registrationId, scores, comments);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSaved(true);
    toast.success("Score saved.");
  }

  const weighted = computeWeightedScore(scores);

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4">
      {STAGE1_CRITERIA.map((criterion) => (
        <div key={criterion.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <Label>
              {criterion.label} <span className="text-xs text-muted-foreground">({criterion.weight}%)</span>
            </Label>
            <Select
              value={String(scores[criterion.key])}
              onValueChange={(v) => {
                setSaved(false);
                setScores((prev) => ({ ...prev, [criterion.key]: Number(v) }));
              }}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{criterion.description}</p>
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="judge-comments">Comments (optional)</Label>
        <Textarea
          id="judge-comments"
          value={comments}
          onChange={(e) => {
            setSaved(false);
            setComments(e.target.value);
          }}
          maxLength={2000}
          rows={4}
          placeholder="Notes for the panel — strengths, concerns, anything worth flagging."
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-sm">
          Weighted score: <span className="font-semibold">{weighted.toFixed(1)} / 10</span>
        </span>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : saved ? "Update score" : "Submit score"}
        </Button>
      </div>
    </div>
  );
}
