import { STAGE1_CRITERIA } from "@/lib/scoring";
import type { AdminJudgeScore } from "@/app/actions/admin";

const CRITERION_ACCESSOR: Record<string, (s: AdminJudgeScore) => number | null> = {
  problem_relevance: (s) => s.problemRelevance,
  technical_implementation: (s) => s.technicalImplementation,
  innovation_creativity: (s) => s.innovationCreativity,
  feasibility_scalability: (s) => s.feasibilityScalability,
  completion_functionality: (s) => s.completionFunctionality,
};

const CRITERION_SHORT_LABEL: Record<string, string> = {
  problem_relevance: "Relev.",
  technical_implementation: "Tech.",
  innovation_creativity: "Innov.",
  feasibility_scalability: "Feas.",
  completion_functionality: "Compl.",
};

const GRID_COLS = "grid grid-cols-[minmax(0,1.4fr)_repeat(5,56px)_72px] items-center gap-2.5";

/**
 * Judge scores table for the team detail page — per-criterion breakdown
 * across the assigned panel, plus each judge's written comment below.
 * Read-only: judges edit their own scores elsewhere until the round closes.
 */
export function JudgeScoresSummary({
  scores,
  avgScore,
  assignedCount,
}: {
  scores: AdminJudgeScore[];
  avgScore: number | null;
  assignedCount: number;
}) {
  const submittedCount = scores.filter((s) => s.status === "submitted").length;
  const draftCount = scores.length - submittedCount;
  const heading =
    scores.length > 0
      ? `${submittedCount} of ${assignedCount} assigned judges have scored` +
        (draftCount > 0 ? ` (${draftCount} drafting)` : "")
      : "No scores submitted yet";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">
            Judge scores · Stage 1
          </span>
          <h3 className="m-0 font-heading text-[22px] font-medium tracking-[-0.01em] text-black">{heading}</h3>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">Average</span>
          <span className="font-heading text-[34px] font-bold leading-none tracking-[-0.02em] text-gignite-warn">
            {avgScore === null ? "—" : `${avgScore.toFixed(1)} / 10`}
          </span>
        </div>
      </div>

      {scores.length > 0 && (
        <>
          <div className="overflow-hidden rounded-[10px] border border-gignite-divider">
            <div className={`${GRID_COLS} bg-gignite-card px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-text`}>
              <span>Judge</span>
              {STAGE1_CRITERIA.map((c) => (
                <span key={c.key} className="text-center leading-tight">
                  {CRITERION_SHORT_LABEL[c.key]}
                  <br />
                  {c.weight}%
                </span>
              ))}
              <span className="text-right">Weighted</span>
            </div>
            {scores.map((s) => (
              <div key={s.id} className={`${GRID_COLS} border-t border-gignite-divider bg-white px-4 py-3`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-black">{s.judgeName}</span>
                  {s.status === "draft" && (
                    <span className="w-fit rounded-full bg-gignite-warn-pale px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-gignite-warn">
                      Draft
                    </span>
                  )}
                </div>
                {STAGE1_CRITERIA.map((c) => (
                  <span key={c.key} className="text-center font-mono text-[14px] text-gignite-text">
                    {CRITERION_ACCESSOR[c.key](s) ?? "—"}
                  </span>
                ))}
                <span className="text-right font-heading text-[16px] font-bold text-gignite-blue">
                  {s.weighted !== null ? s.weighted.toFixed(1) : "—"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3.5">
            {scores.map((s) => (
              <div key={s.id} className="flex flex-col gap-1.5 rounded-[10px] bg-gignite-card p-4">
                <div className="flex items-baseline justify-between gap-3.5">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-black">
                    {s.judgeName}
                    {s.status === "draft" && (
                      <span className="rounded-full bg-gignite-warn-pale px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-gignite-warn">
                        Draft
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[12px] text-gignite-blue">
                    {s.weighted !== null ? `${s.weighted.toFixed(1)} weighted` : "In progress"}
                  </span>
                </div>
                {s.comments && <p className="m-0 text-[14px] leading-[1.6] text-gignite-text">{s.comments}</p>}
              </div>
            ))}
          </div>
          <span className="text-[13px] leading-[1.5] text-gignite-text/70">
            Read-only. Judges edit their own scores until the round closes; the average is unweighted across judges.
          </span>
        </>
      )}
    </div>
  );
}
