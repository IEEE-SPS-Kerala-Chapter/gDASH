"use client";

import { useState } from "react";
import { toast } from "sonner";
import { STAGE1_CRITERIA, computeWeightedScore, type Stage1CriterionKey, type Stage1Scores } from "@/lib/scoring";
import { submitScore } from "@/app/actions/judge";
import type { AdminJudgeScore } from "@/app/actions/admin";
import { TextArea } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

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

/**
 * A judge's Stage 1 scoring form — per the Claude Design file "gIGNITE
 * Judge Scoring.dc.html" (chip-button 1–10 picker, prominent weighted-score
 * readout, save status line). That design also covers Grand Finale scoring
 * across all 8 rulebook parameters with a stage toggle; this platform only
 * has Stage 1 data, so this form stays scoped to the five Stage-1-weighted
 * criteria it's always used.
 */
export function ScoreForm({ registrationId, existingScore }: { registrationId: string; existingScore?: AdminJudgeScore }) {
  const [scores, setScores] = useState<Stage1Scores>(toStage1Scores(existingScore));
  const [comments, setComments] = useState(existingScore?.comments ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(existingScore));
  const [dirty, setDirty] = useState(false);

  function setScore(key: Stage1CriterionKey, n: number) {
    setDirty(true);
    setSaved(false);
    setScores((prev) => ({ ...prev, [key]: n }));
  }

  async function handleSubmit() {
    setSaving(true);
    const result = await submitScore(registrationId, scores, comments);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSaved(true);
    setDirty(false);
    toast.success("Score saved.");
  }

  const weighted = computeWeightedScore(scores);
  const savedLabel = saved
    ? "Saved — your scores stay editable until the round closes"
    : dirty
      ? "Not saved yet"
      : existingScore
        ? "Saved earlier — your scores stay editable until the round closes"
        : "Score every criterion, then save";

  return (
    <div className="flex flex-col gap-7 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-gignite-divider pb-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">
          Stage 1 · Your evaluation
        </span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">Weighted score</span>
          <span className="font-heading text-[30px] font-bold leading-none tracking-[-0.02em] text-gignite-warn">
            {weighted.toFixed(1)} / 10
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {STAGE1_CRITERIA.map((criterion) => (
          <div key={criterion.key} className="flex flex-col gap-3 border-t border-gignite-divider pt-5 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2.5">
                <span className="font-heading text-[18px] font-medium tracking-[-0.01em] text-black">
                  {criterion.label}
                </span>
                <span className="font-mono text-[11px] text-gignite-blue">{criterion.weight}% weight</span>
              </div>
              <span className="font-heading text-[15px] font-bold text-gignite-warn">{scores[criterion.key]} / 10</span>
            </div>
            <p className="m-0 text-[14px] leading-[1.5] text-gignite-text/75">{criterion.description}</p>
            <div className="flex gap-1.5">
              {SCORE_OPTIONS.map((n) => {
                const on = scores[criterion.key] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(criterion.key, n)}
                    className={cn(
                      "flex-1 rounded-[9px] border-[1.5px] py-3 font-heading text-[15px] font-bold transition-transform hover:-translate-y-0.5 hover:border-gignite-accent",
                      on ? "border-gignite-accent bg-gignite-accent text-black" : "border-gignite-border bg-white text-gignite-text",
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <label htmlFor="judge-comments" className="font-mono text-[11px] uppercase tracking-[0.14em] text-gignite-text/70">
          Comments
        </label>
        <TextArea
          id="judge-comments"
          value={comments}
          onChange={(e) => {
            setSaved(false);
            setDirty(true);
            setComments(e.target.value);
          }}
          maxLength={2000}
          rows={5}
          placeholder="What worked, and what you'd push on if they had another day."
        />
        <span className="text-[13px] text-gignite-text/70">
          Shared with the team after results are announced. Scores stay private to the panel.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className={cn(
            "rounded-[11px] px-9 py-4 font-heading text-[17px] font-bold transition-colors",
            saving
              ? "cursor-not-allowed bg-gignite-border text-gignite-muted"
              : "bg-gignite-accent text-black shadow-[0_3px_0_rgba(150,67,11,0.45)] hover:bg-gignite-accent-hover",
          )}
        >
          {saving ? "Saving…" : "Save score"}
        </button>
        <span className={cn("text-[14px]", saved ? "text-gignite-success" : "text-gignite-text/60")}>{savedLabel}</span>
      </div>
    </div>
  );
}
