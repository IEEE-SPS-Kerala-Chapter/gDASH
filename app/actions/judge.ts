"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { mapTeamRow, redactMemberContactInfo, TEAM_SELECT, type AdminTeam, type RawTeamRow } from "@/lib/admin-teams";
import { STAGE1_CRITERIA, isValidStage1Score, isCompleteStage1Scores, type Stage1Scores, type PartialStage1Scores } from "@/lib/scoring";
import { logAuditEvent } from "@/lib/audit-log";

/**
 * A judge's own dashboard data: teams assigned to them. Uses the same
 * TEAM_SELECT as the admin dashboard, but RLS (can_view_team /
 * can_view_registration) transparently scopes the result down to only
 * this judge's assignments — there's no separate "assigned teams" filter
 * to get wrong here, the database enforces it.
 */
export async function getMyAssignedTeams(): Promise<
  { success: true; teams: AdminTeam[] } | { success: false; error: string }
> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (caller.role !== "judge") {
    return { success: false, error: "Only judges have an assigned-teams view." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Could not load your assigned teams." };
  }
  return {
    success: true,
    teams: (data ?? []).map((t) => redactMemberContactInfo(mapTeamRow(t as unknown as RawTeamRow))),
  };
}

type ScoreResult = { success: true } | { success: false; error: string };

function validatePartialScores(scores: PartialStage1Scores): string | null {
  for (const criterion of STAGE1_CRITERIA) {
    const v = scores[criterion.key];
    if (v !== undefined && v !== null && !isValidStage1Score(v)) {
      return `${criterion.label} must be a whole number from 1 to 10.`;
    }
  }
  return null;
}

/**
 * Judge-only: save a possibly-incomplete Stage 1 evaluation, to continue
 * later — see supabase/migrations/20260923020000_judge_score_drafts.sql.
 * Unlike submitScore, a criterion left out of `scores` is saved as
 * genuinely unscored (null), not defaulted to anything, and comments can
 * be saved alone with zero criteria filled in.
 */
export async function saveScoreDraft(
  registrationId: string,
  scores: PartialStage1Scores,
  comments: string,
): Promise<ScoreResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (caller.role !== "judge") {
    return { success: false, error: "Only judges can score." };
  }

  const scoreError = validatePartialScores(scores);
  if (scoreError) {
    return { success: false, error: scoreError };
  }
  if (comments.length > 2000) {
    return { success: false, error: "Comments must be 2000 characters or fewer." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("judge_scores").upsert(
    {
      registration_id: registrationId,
      judge_id: caller.userId,
      problem_relevance: scores.problem_relevance ?? null,
      technical_implementation: scores.technical_implementation ?? null,
      innovation_creativity: scores.innovation_creativity ?? null,
      feasibility_scalability: scores.feasibility_scalability ?? null,
      completion_functionality: scores.completion_functionality ?? null,
      comments: comments.trim() === "" ? null : comments.trim(),
      status: "draft",
    },
    { onConflict: "registration_id,judge_id" },
  );

  if (error) {
    return { success: false, error: "Could not save your draft. Make sure this team is assigned to you." };
  }
  await logAuditEvent(supabase, "judge.score_draft_saved", {
    targetType: "registration",
    targetId: registrationId,
  });
  return { success: true };
}

/**
 * Judge-only: submit this judge's final Stage 1 score for a registration —
 * unlike saveScoreDraft, every criterion must be complete. Still editable
 * afterwards (see ScoreForm) via either action again; judge_scores' CHECK
 * constraints and RLS (insert/update require an actual
 * registration_assignments row for this judge) are the real backstop
 * regardless of what the client sends.
 */
export async function submitScore(
  registrationId: string,
  scores: Stage1Scores,
  comments: string,
): Promise<ScoreResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (caller.role !== "judge") {
    return { success: false, error: "Only judges can submit scores." };
  }
  if (!isCompleteStage1Scores(scores)) {
    return { success: false, error: "Score every criterion before submitting." };
  }
  if (comments.length > 2000) {
    return { success: false, error: "Comments must be 2000 characters or fewer." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("judge_scores").upsert(
    {
      registration_id: registrationId,
      judge_id: caller.userId,
      problem_relevance: scores.problem_relevance,
      technical_implementation: scores.technical_implementation,
      innovation_creativity: scores.innovation_creativity,
      feasibility_scalability: scores.feasibility_scalability,
      completion_functionality: scores.completion_functionality,
      comments: comments.trim() === "" ? null : comments.trim(),
      status: "submitted",
    },
    { onConflict: "registration_id,judge_id" },
  );

  if (error) {
    return { success: false, error: "Could not save your score. Make sure this team is assigned to you." };
  }
  await logAuditEvent(supabase, "judge.score_submitted", {
    targetType: "registration",
    targetId: registrationId,
  });
  return { success: true };
}
