/**
 * Shared team/registration shape + mapping used by both the admin and judge
 * dashboards. Lives outside app/actions (a "use server" module, which may
 * only export async functions) because TEAM_SELECT and mapTeamRow are a
 * plain constant and a plain function, not server actions themselves.
 */
import { computeWeightedScore, isCompleteStage1Scores, type PartialStage1Scores } from "@/lib/scoring";

export type AdminMember = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  college: string;
  branch: string | null;
  year: string | null;
  role_in_team: string | null;
  is_leader: boolean;
};

export type AdminJudge = {
  id: string;
  full_name: string;
  email: string;
};

export type AdminAssignment = {
  id: string;
  judge_id: string;
  judge_name: string;
};

/**
 * One judge's Stage 1 score for a registration — see lib/scoring.ts for the
 * weights. A criterion is null while status is "draft" (see
 * supabase/migrations/20260923020000_judge_score_drafts.sql) — "submitted"
 * guarantees all five are filled, by construction of submitScore().
 * weighted is null for a draft for the same reason: nothing complete to
 * compute it from yet.
 */
export type AdminJudgeScore = {
  id: string;
  judgeId: string;
  judgeName: string;
  status: "draft" | "submitted";
  problemRelevance: number | null;
  technicalImplementation: number | null;
  innovationCreativity: number | null;
  feasibilityScalability: number | null;
  completionFunctionality: number | null;
  comments: string | null;
  weighted: number | null;
};

export type VerificationStatus = "pending" | "verified" | "ineligible";

export type AdminRegistration = {
  id: string;
  problem_statement: string;
  proposed_solution: string;
  ai_approach: string;
  expected_impact: string;
  supporting_link: string | null;
  deck_path: string | null;
  status: "submitted" | "under_review" | "shortlisted" | "rejected";
  /**
   * Admin eligibility check (ID cards etc.) — separate from `status`, which
   * is the judging outcome. Only "verified" registrations can be assigned
   * judges; see supabase/migrations/20260923030000_registration_verification.sql.
   */
  verification_status: VerificationStatus;
  verification_note: string | null;
  verification_decided_at: string | null;
  verification_decided_by_name: string | null;
  created_at: string;
  declaration_eligibility: boolean;
  declaration_originality: boolean;
  declaration_rules: boolean;
  declaration_media_consent: boolean;
  assignments: AdminAssignment[];
  /**
   * Whoever the caller is, RLS already scoped this: an admin sees every
   * judge's score, a judge sees only their own (nothing here for a caller
   * with no score rows, e.g. a judge who hasn't scored yet).
   */
  scores: AdminJudgeScore[];
  avgScore: number | null;
};

export type AdminTeam = {
  id: string;
  name: string;
  entry_code: string;
  ai_theme: string;
  district: string;
  status: string;
  created_at: string;
  members: AdminMember[];
  registration: AdminRegistration | null;
};

export const TEAM_SELECT = `id, name, entry_code, ai_theme, district, status, created_at,
     team_members ( id, full_name, email, phone, college, branch, year, role_in_team, is_leader ),
     registrations (
       id, problem_statement, proposed_solution, ai_approach, expected_impact,
       supporting_link, deck_path, status, created_at,
       verification_status, verification_note, verification_decided_at,
       verification_decided_by:profiles!registrations_verification_decided_by_fkey ( full_name ),
       declaration_eligibility, declaration_originality, declaration_rules, declaration_media_consent,
       registration_assignments ( id, judge_id, profiles!registration_assignments_judge_id_fkey ( full_name ) ),
       judge_scores (
         id, judge_id, status, problem_relevance, technical_implementation, innovation_creativity,
         feasibility_scalability, completion_functionality, comments,
         profiles ( full_name )
       )
     )`;

type RawJudgeScore = {
  id: string;
  judge_id: string;
  status: "draft" | "submitted";
  problem_relevance: number | null;
  technical_implementation: number | null;
  innovation_creativity: number | null;
  feasibility_scalability: number | null;
  completion_functionality: number | null;
  comments: string | null;
  profiles: { full_name: string } | null;
};

type RawRegistration = Omit<
  AdminRegistration,
  "assignments" | "scores" | "avgScore" | "verification_decided_by_name"
> & {
  verification_decided_by: { full_name: string } | null;
  registration_assignments: Array<{ id: string; judge_id: string; profiles: { full_name: string } | null }>;
  judge_scores: RawJudgeScore[];
};

export type RawTeamRow = {
  id: string;
  name: string;
  entry_code: string;
  ai_theme: string;
  district: string;
  status: string;
  created_at: string;
  team_members: AdminMember[] | null;
  registrations: RawRegistration | RawRegistration[] | null;
};

export function mapTeamRow(t: RawTeamRow): AdminTeam {
  const rawReg = Array.isArray(t.registrations) ? t.registrations[0] : t.registrations;
  let registration: AdminRegistration | null = null;
  if (rawReg) {
    const scores: AdminJudgeScore[] = (rawReg.judge_scores ?? []).map((s) => {
      const stage1: PartialStage1Scores = {
        problem_relevance: s.problem_relevance ?? undefined,
        technical_implementation: s.technical_implementation ?? undefined,
        innovation_creativity: s.innovation_creativity ?? undefined,
        feasibility_scalability: s.feasibility_scalability ?? undefined,
        completion_functionality: s.completion_functionality ?? undefined,
      };
      return {
        id: s.id,
        judgeId: s.judge_id,
        judgeName: s.profiles?.full_name ?? "Unknown",
        status: s.status,
        problemRelevance: s.problem_relevance,
        technicalImplementation: s.technical_implementation,
        innovationCreativity: s.innovation_creativity,
        feasibilityScalability: s.feasibility_scalability,
        completionFunctionality: s.completion_functionality,
        comments: s.comments,
        weighted: isCompleteStage1Scores(stage1) ? computeWeightedScore(stage1) : null,
      };
    });
    // A still-drafting judge's incomplete score shouldn't pull the team's
    // average toward whatever they've entered so far — only a submitted
    // (and therefore complete, by construction of submitScore()) score
    // counts toward it.
    const submittedScores = scores.filter((s) => s.status === "submitted" && s.weighted !== null);
    const { verification_decided_by, ...regFields } = rawReg;
    registration = {
      ...regFields,
      verification_decided_by_name: verification_decided_by?.full_name ?? null,
      assignments: (rawReg.registration_assignments ?? []).map((a) => ({
        id: a.id,
        judge_id: a.judge_id,
        judge_name: a.profiles?.full_name ?? "Unknown",
      })),
      scores,
      avgScore:
        submittedScores.length > 0
          ? submittedScores.reduce((sum, s) => sum + (s.weighted as number), 0) / submittedScores.length
          : null,
    };
  }
  return {
    id: t.id,
    name: t.name,
    entry_code: t.entry_code,
    ai_theme: t.ai_theme,
    district: t.district,
    status: t.status,
    created_at: t.created_at,
    members: t.team_members ?? [],
    registration,
  };
}

/**
 * Judges only ever get name + college in the UI (no member contact info, to
 * avoid any bias) — but the query above still pulls email/phone for
 * everyone, since RLS's is_staff() covers judges too. Strip those fields
 * here, server-side, before the team ever reaches a judge's browser, rather
 * than relying on the UI alone to not render them (that data would still
 * sit in the page payload otherwise, visible to anyone inspecting it).
 */
export function redactMemberContactInfo(team: AdminTeam): AdminTeam {
  return {
    ...team,
    members: team.members.map((m) => ({ ...m, email: "", phone: "" })),
  };
}
