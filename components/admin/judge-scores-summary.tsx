import { STAGE1_CRITERIA } from "@/lib/scoring";
import type { AdminJudgeScore } from "@/app/actions/admin";

const CRITERION_ACCESSOR: Record<string, (s: AdminJudgeScore) => number> = {
  problem_relevance: (s) => s.problemRelevance,
  technical_implementation: (s) => s.technicalImplementation,
  innovation_creativity: (s) => s.innovationCreativity,
  feasibility_scalability: (s) => s.feasibilityScalability,
  completion_functionality: (s) => s.completionFunctionality,
};

/** Read-only breakdown of every judge's Stage 1 score for a registration — admin view only. */
export function JudgeScoresSummary({ scores, avgScore }: { scores: AdminJudgeScore[]; avgScore: number | null }) {
  if (scores.length === 0) {
    return <p className="text-sm text-muted-foreground">No judge has scored this team yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {avgScore !== null && (
        <p className="text-sm">
          Average weighted score ({scores.length} judge{scores.length > 1 ? "s" : ""}):{" "}
          <span className="font-semibold">{avgScore.toFixed(1)} / 10</span>
        </p>
      )}
      <div className="flex flex-col gap-3">
        {scores.map((s) => (
          <div key={s.id} className="rounded-md border bg-card p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{s.judgeName}</span>
              <span className="font-semibold">{s.weighted.toFixed(1)} / 10</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {STAGE1_CRITERIA.map((c) => (
                <span key={c.key}>
                  {c.label}: {CRITERION_ACCESSOR[c.key](s)}
                </span>
              ))}
            </div>
            {s.comments && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{s.comments}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
