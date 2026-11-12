/**
 * Judging progress and statistics, shared by the Judging page
 * (components/admin/judging-stats.tsx), the judge chips on the team list
 * and team page, and the judging report PDF (lib/judging-report.ts).
 * Plain functions, safe on the client and the server.
 *
 * A judge's progress on a team:
 *   done         — submitted their score (green)
 *   in_progress  — saved a draft, not submitted yet (yellow)
 *   not_started  — no score saved at all (red)
 */
import { computeWeightedScore, isCompleteStage1Scores, STAGE1_CRITERIA, type PartialStage1Scores, type Stage1CriterionKey } from "@/lib/scoring";

export type JudgeProgress = "done" | "in_progress" | "not_started";

export const JUDGE_PROGRESS_LABELS: Record<JudgeProgress, string> = {
  done: "Scored",
  in_progress: "Scoring in progress",
  not_started: "Not started",
};

/** Badge tones (components/admin/ui.tsx Badge): green, yellow, red. */
export const JUDGE_PROGRESS_BADGE: Record<JudgeProgress, "success" | "warn" | "danger"> = {
  done: "success",
  in_progress: "warn",
  not_started: "danger",
};

export const JUDGE_PROGRESS_ORDER: JudgeProgress[] = ["not_started", "in_progress", "done"];

/** One judge's progress from the registration's score rows (`status` is "draft" or "submitted"). */
export function judgeProgress(scores: { judgeId: string; status: string }[], judgeId: string): JudgeProgress {
  const score = scores.find((s) => s.judgeId === judgeId);
  if (!score) return "not_started";
  return score.status === "submitted" ? "done" : "in_progress";
}

// ---------------------------------------------------------------------------
// The Judging page's data.

export type JudgingScore = {
  judgeId: string;
  judgeName: string;
  status: "draft" | "submitted";
  criteria: PartialStage1Scores;
  /** Weighted score on the 1–10 scale; null until every criterion is filled. */
  weighted: number | null;
  updatedAt: string;
};

export type JudgingTeam = {
  id: string;
  name: string;
  entryCode: string;
  theme: string;
  district: string;
  status: "submitted" | "under_review" | "shortlisted" | "rejected";
  verification: "pending" | "verified" | "needs_correction" | "ineligible";
  assignments: { judgeId: string; judgeName: string; assignedAt: string }[];
  /** Every score on record, including from a judge since unassigned. */
  scores: JudgingScore[];
};

export type JudgingJudge = { id: string; name: string; email: string };

export function weightedOrNull(criteria: PartialStage1Scores): number | null {
  return isCompleteStage1Scores(criteria) ? computeWeightedScore(criteria) : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Submitted weighted scores for a team (the same ones its dashboard average uses). */
export function submittedScores(team: Pick<JudgingTeam, "scores">): JudgingScore[] {
  return team.scores.filter((s) => s.status === "submitted" && s.weighted !== null);
}

export type TeamJudgingSummary = {
  team: JudgingTeam;
  /** Mean of the submitted weighted scores; null with none. */
  avg: number | null;
  /** Sum of the submitted weighted scores (each out of 10). */
  total: number;
  /** Highest minus lowest submitted score; null with fewer than two. */
  spread: number | null;
  submitted: number;
  assigned: number;
  /** Every assigned judge has submitted. */
  complete: boolean;
};

export function summariseTeam(team: JudgingTeam): TeamJudgingSummary {
  const done = submittedScores(team).map((s) => s.weighted as number);
  const submittedIds = new Set(submittedScores(team).map((s) => s.judgeId));
  return {
    team,
    avg: mean(done),
    total: done.reduce((a, b) => a + b, 0),
    spread: done.length >= 2 ? Math.max(...done) - Math.min(...done) : null,
    submitted: done.length,
    assigned: team.assignments.length,
    complete: team.assignments.length > 0 && team.assignments.every((a) => submittedIds.has(a.judgeId)),
  };
}

export type JudgeSummary = {
  judge: JudgingJudge;
  teams: { team: JudgingTeam; progress: JudgeProgress; weighted: number | null }[];
  counts: Record<JudgeProgress, number>;
  /** Mean of this judge's submitted scores. */
  avgGiven: number | null;
  /** avgGiven minus the panel's mean over the same teams, from the other judges. */
  leniency: number | null;
  minGiven: number | null;
  maxGiven: number | null;
  criteriaAvg: Partial<Record<Stage1CriterionKey, number>>;
  lastActivity: string | null;
};

/** At least this far from the other judges on the same teams to be called generous or strict. */
export const LENIENCY_THRESHOLD = 0.75;
/** Submitted scores this far apart on one team are flagged as a disagreement. */
export const DISAGREEMENT_THRESHOLD = 2;

export function leniencyLabel(leniency: number | null, scored: number): string {
  if (leniency === null || scored < 3) return "Too few scores to compare";
  if (leniency >= LENIENCY_THRESHOLD) return "Scores higher than the panel";
  if (leniency <= -LENIENCY_THRESHOLD) return "Scores lower than the panel";
  return "In line with the panel";
}

export function summariseJudge(judge: JudgingJudge, teams: JudgingTeam[]): JudgeSummary {
  const assigned = teams.filter((t) => t.assignments.some((a) => a.judgeId === judge.id));
  const rows = assigned.map((team) => {
    const score = team.scores.find((s) => s.judgeId === judge.id);
    return {
      team,
      progress: judgeProgress(team.scores, judge.id),
      weighted: score?.status === "submitted" ? score.weighted : null,
    };
  });
  const counts: Record<JudgeProgress, number> = { done: 0, in_progress: 0, not_started: 0 };
  rows.forEach((r) => (counts[r.progress] += 1));

  const mine = teams.flatMap((t) => t.scores.filter((s) => s.judgeId === judge.id && s.status === "submitted" && s.weighted !== null));
  const given = mine.map((s) => s.weighted as number);

  // Compare with the other judges on the same teams, so a judge who drew
  // stronger teams isn't called generous.
  const diffs: number[] = [];
  for (const team of teams) {
    const own = team.scores.find((s) => s.judgeId === judge.id && s.status === "submitted" && s.weighted !== null);
    if (!own) continue;
    const others = submittedScores(team).filter((s) => s.judgeId !== judge.id).map((s) => s.weighted as number);
    const othersAvg = mean(others);
    if (othersAvg !== null) diffs.push((own.weighted as number) - othersAvg);
  }

  const criteriaAvg: Partial<Record<Stage1CriterionKey, number>> = {};
  for (const c of STAGE1_CRITERIA) {
    const avg = mean(mine.map((s) => s.criteria[c.key]).filter((v): v is number => typeof v === "number"));
    if (avg !== null) criteriaAvg[c.key] = avg;
  }

  const activity = teams.flatMap((t) => t.scores.filter((s) => s.judgeId === judge.id).map((s) => s.updatedAt)).sort();

  return {
    judge,
    teams: rows.sort((a, b) => JUDGE_PROGRESS_ORDER.indexOf(a.progress) - JUDGE_PROGRESS_ORDER.indexOf(b.progress)),
    counts,
    avgGiven: mean(given),
    leniency: mean(diffs),
    minGiven: given.length ? Math.min(...given) : null,
    maxGiven: given.length ? Math.max(...given) : null,
    criteriaAvg,
    lastActivity: activity.at(-1) ?? null,
  };
}

/** Panel-wide average of each criterion, over every submitted score. */
export function panelCriteriaAverages(teams: JudgingTeam[]): Partial<Record<Stage1CriterionKey, number>> {
  const all = teams.flatMap((t) => submittedScores(t));
  const out: Partial<Record<Stage1CriterionKey, number>> = {};
  for (const c of STAGE1_CRITERIA) {
    const avg = mean(all.map((s) => s.criteria[c.key]).filter((v): v is number => typeof v === "number"));
    if (avg !== null) out[c.key] = avg;
  }
  return out;
}

/** Team averages in 1-point buckets: [1–2), [2–3) … [9–10]. */
export function scoreDistribution(summaries: TeamJudgingSummary[]): { label: string; count: number }[] {
  const buckets = Array.from({ length: 9 }, (_, i) => ({ label: `${i + 1}–${i + 2}`, count: 0 }));
  for (const s of summaries) {
    if (s.avg === null) continue;
    buckets[Math.min(Math.max(Math.floor(s.avg) - 1, 0), 8)].count += 1;
  }
  return buckets;
}

export function formatScore(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}
