/**
 * The query and row mapping behind the Judging page and the judging
 * report, kept outside app/actions (a "use server" module may only export
 * async functions).
 */
import type { JudgingScore, JudgingTeam } from "@/lib/judging";
import { weightedOrNull } from "@/lib/judging";
import { STAGE1_CRITERIA, type PartialStage1Scores } from "@/lib/scoring";

const CRITERIA_COLUMNS = STAGE1_CRITERIA.map((c) => c.key).join(", ");

export const JUDGING_TEAM_SELECT = `id, name, entry_code, ai_theme, district,
  registrations!inner (
    status, verification_status,
    registration_assignments ( judge_id, assigned_at, profiles!registration_assignments_judge_id_fkey ( full_name ) ),
    judge_scores ( judge_id, status, ${CRITERIA_COLUMNS}, comments, updated_at, profiles ( full_name ) )
  )`;

type RawScore = Record<string, unknown> & {
  judge_id: string;
  status: "draft" | "submitted";
  comments: string | null;
  updated_at: string;
  profiles: { full_name: string } | null;
};

type RawRegistration = {
  status: JudgingTeam["status"];
  verification_status: JudgingTeam["verification"];
  registration_assignments: { judge_id: string; assigned_at: string; profiles: { full_name: string } | null }[] | null;
  judge_scores: RawScore[] | null;
};

type RawJudgingTeam = {
  id: string;
  name: string;
  entry_code: string;
  ai_theme: string;
  district: string;
  registrations: RawRegistration | RawRegistration[] | null;
};

export type JudgingScoreWithComments = JudgingScore & { comments: string | null };

export function mapJudgingTeam(raw: RawJudgingTeam): (JudgingTeam & { scores: JudgingScoreWithComments[] }) | null {
  const reg = Array.isArray(raw.registrations) ? raw.registrations[0] : raw.registrations;
  if (!reg) return null;
  const scores = (reg.judge_scores ?? []).map((s) => {
    const criteria: PartialStage1Scores = {};
    for (const c of STAGE1_CRITERIA) {
      const v = s[c.key];
      if (typeof v === "number") criteria[c.key] = v;
    }
    return {
      judgeId: s.judge_id,
      judgeName: s.profiles?.full_name ?? "Unknown judge",
      status: s.status,
      criteria,
      weighted: weightedOrNull(criteria),
      updatedAt: s.updated_at,
      comments: s.comments,
    };
  });
  return {
    id: raw.id,
    name: raw.name,
    entryCode: raw.entry_code,
    theme: raw.ai_theme,
    district: raw.district,
    status: reg.status,
    verification: reg.verification_status,
    assignments: (reg.registration_assignments ?? [])
      .map((a) => ({ judgeId: a.judge_id, judgeName: a.profiles?.full_name ?? "Unknown judge", assignedAt: a.assigned_at }))
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt)),
    scores,
  };
}

export function mapJudgingTeams(rows: unknown[]): JudgingTeam[] {
  return rows
    .map((r) => mapJudgingTeam(r as RawJudgingTeam))
    .filter((t): t is NonNullable<typeof t> => t !== null)
    // The page never shows comments; keep the payload small.
    .map((t) => ({ ...t, scores: t.scores.map((s) => ({ ...s, comments: null })) }));
}
