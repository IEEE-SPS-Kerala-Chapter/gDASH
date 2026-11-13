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

// ---------------------------------------------------------------------------
// The judging report (PDF and CSV): the same, plus the team's college and
// submission time, and the judges' comments.

export const JUDGING_REPORT_SELECT = `${JUDGING_TEAM_SELECT.replace("registrations!inner (", "registrations!inner ( created_at,")},
  team_members ( college, is_leader, member_no )`;

export type JudgingReportTeam = Omit<JudgingTeam, "scores"> & {
  scores: JudgingScoreWithComments[];
  /** The leader's college. */
  college: string;
  /** When the registration was submitted. */
  submittedAt: string | null;
};

export function mapJudgingReportTeam(row: unknown): JudgingReportTeam | null {
  const raw = row as RawJudgingTeam & { team_members: { college: string; is_leader: boolean; member_no: number }[] | null };
  const team = mapJudgingTeam(raw);
  if (!team) return null;
  const regs = raw.registrations as unknown as { created_at?: string } | { created_at?: string }[] | null;
  const members = [...(raw.team_members ?? [])].sort((a, b) => a.member_no - b.member_no);
  return {
    ...team,
    college: (members.find((m) => m.is_leader) ?? members[0])?.college ?? "",
    submittedAt: (Array.isArray(regs) ? regs[0] : regs)?.created_at ?? null,
  };
}

/** The team's judges in assignment order, then anyone who scored but was unassigned since. */
export function reportJudges(team: JudgingTeam): { id: string; name: string; assigned: boolean }[] {
  const assignedIds = new Set(team.assignments.map((a) => a.judgeId));
  return [
    ...team.assignments.map((a) => ({ id: a.judgeId, name: a.judgeName, assigned: true })),
    ...team.scores.filter((s) => !assignedIds.has(s.judgeId)).map((s) => ({ id: s.judgeId, name: s.judgeName, assigned: false })),
  ];
}
