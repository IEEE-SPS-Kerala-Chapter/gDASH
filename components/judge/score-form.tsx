"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  STAGE1_CRITERIA,
  computeWeightedScore,
  isCompleteStage1Scores,
  type Stage1CriterionKey,
  type PartialStage1Scores,
} from "@/lib/scoring";
import { saveScoreDraft, submitScore } from "@/app/actions/judge";
import type { AdminJudgeScore } from "@/app/actions/admin";
import { TextArea } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

/** Unlike the old always-defaults-to-5 version, an untouched or genuinely
 * unscored criterion stays undefined here — see judge_score_drafts.sql. */
function toPartialStage1Scores(score: AdminJudgeScore | undefined): PartialStage1Scores {
  return {
    problem_relevance: score?.problemRelevance ?? undefined,
    technical_implementation: score?.technicalImplementation ?? undefined,
    innovation_creativity: score?.innovationCreativity ?? undefined,
    feasibility_scalability: score?.feasibilityScalability ?? undefined,
    completion_functionality: score?.completionFunctionality ?? undefined,
  };
}

/**
 * A judge's Stage 1 scoring form — per the Claude Design file "gIGNITE
 * Judge Scoring.dc.html" (chip-button 1–10 picker, prominent weighted-score
 * readout, save status line). That design also covers Grand Finale scoring
 * across all 8 rulebook parameters with a stage toggle; this platform only
 * has Stage 1 data, so this form stays scoped to the five Stage-1-weighted
 * criteria it's always used.
 *
 * Two separate actions, not one: "Save draft" persists whatever's filled in
 * so far (even nothing) so a judge can genuinely leave and come back —
 * "Submit score" requires every criterion, same as the old single "Save
 * score" button always effectively required (it just hid that behind
 * silently defaulting everything to 5).
 */
export function ScoreForm({ registrationId, existingScore }: { registrationId: string; existingScore?: AdminJudgeScore }) {
  const [scores, setScores] = useState<PartialStage1Scores>(toPartialStage1Scores(existingScore));
  const [comments, setComments] = useState(existingScore?.comments ?? "");
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedStatus, setSavedStatus] = useState<"none" | "draft" | "submitted">(existingScore?.status ?? "none");
  const [dirty, setDirty] = useState(false);

  function setScore(key: Stage1CriterionKey, n: number) {
    setDirty(true);
    setScores((prev) => ({ ...prev, [key]: n }));
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    const result = await saveScoreDraft(registrationId, scores, comments);
    setSavingDraft(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSavedStatus("draft");
    setDirty(false);
    toast.success("Draft saved.");
  }

  async function handleSubmit() {
    if (!isCompleteStage1Scores(scores)) return;
    setSubmitting(true);
    const result = await submitScore(registrationId, scores, comments);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSavedStatus("submitted");
    setDirty(false);
    toast.success("Score submitted.");
  }

  const complete = isCompleteStage1Scores(scores);
  // Called directly (not via the `complete` boolean above) so TS narrows
  // `scores` to Stage1Scores in this branch — a boolean var doesn't carry
  // that narrowing through.
  const weighted = isCompleteStage1Scores(scores) ? computeWeightedScore(scores) : null;
  const saving = savingDraft || submitting;

  const savedLabel = dirty
    ? "Not saved yet"
    : savedStatus === "submitted"
      ? "Submitted — scores stay editable until the round closes"
      : savedStatus === "draft"
        ? "Draft saved — continue anytime, or submit once every criterion is scored"
        : "Score any criteria and save a draft, or complete all five to submit";

  return (
    <div className="flex flex-col gap-7 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-gignite-divider pb-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">
          Stage 1 · Your evaluation
        </span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">Weighted score</span>
          <span className="font-heading text-[30px] font-bold leading-none tracking-[-0.02em] text-gignite-warn">
            {weighted !== null ? `${weighted.toFixed(1)} / 10` : "— / 10"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {STAGE1_CRITERIA.map((criterion) => {
          const value = scores[criterion.key];
          return (
            <div key={criterion.key} className="flex flex-col gap-3 border-t border-gignite-divider pt-5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-heading text-[18px] font-medium tracking-[-0.01em] text-black">
                    {criterion.label}
                  </span>
                  <span className="font-mono text-[11px] text-gignite-blue">{criterion.weight}% weight</span>
                </div>
                <span
                  className={cn(
                    "font-heading text-[15px] font-bold",
                    value !== undefined ? "text-gignite-warn" : "text-gignite-text/50",
                  )}
                >
                  {value !== undefined ? `${value} / 10` : "Not scored yet"}
                </span>
              </div>
              <p className="m-0 text-[14px] leading-[1.5] text-gignite-text/75">{criterion.description}</p>
              <div className="flex gap-1.5">
                {SCORE_OPTIONS.map((n) => {
                  const on = value === n;
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
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        <label htmlFor="judge-comments" className="font-mono text-[11px] uppercase tracking-[0.14em] text-gignite-text/70">
          Comments
        </label>
        <TextArea
          id="judge-comments"
          value={comments}
          onChange={(e) => {
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className={cn(
            "rounded-[11px] border-[1.5px] px-6 py-4 font-heading text-[15px] font-semibold transition-colors",
            saving
              ? "cursor-not-allowed border-gignite-border text-gignite-muted"
              : "border-gignite-blue text-gignite-blue hover:bg-gignite-blue hover:text-white",
          )}
        >
          {savingDraft ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !complete}
          title={!complete ? "Score every criterion before submitting" : undefined}
          className={cn(
            "rounded-[11px] px-9 py-4 font-heading text-[17px] font-bold transition-colors",
            saving || !complete
              ? "cursor-not-allowed bg-gignite-border text-gignite-muted"
              : "bg-gignite-accent text-black shadow-[0_3px_0_rgba(150,67,11,0.45)] hover:bg-gignite-accent-hover",
          )}
        >
          {submitting ? "Submitting…" : "Submit score"}
        </button>
        <span className={cn("text-[14px]", savedStatus === "submitted" && !dirty ? "text-gignite-success" : "text-gignite-text/60")}>
          {savedLabel}
        </span>
      </div>
    </div>
  );
}
