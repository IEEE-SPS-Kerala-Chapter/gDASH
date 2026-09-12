"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { mapTeamRow, TEAM_SELECT, type AdminTeam, type RawTeamRow } from "@/lib/admin-teams";
import { STAGE1_CRITERIA, isValidStage1Score, type Stage1Scores } from "@/lib/scoring";

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
  return { success: true, teams: (data ?? []).map((t) => mapTeamRow(t as unknown as RawTeamRow)) };
}

type ScoreResult = { success: true } | { success: false; error: string };

/**
 * Judge-only: submit or update this judge's Stage 1 score for a
 * registration. Re-validates the 1-10 range and role here for a clean
 * error message; judge_scores' CHECK constraints and RLS (insert/update
 * require an actual registration_assignments row for this judge) are the
 * real backstop regardless of what the client sends.
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

  for (const criterion of STAGE1_CRITERIA) {
    if (!isValidStage1Score(scores[criterion.key])) {
      return { success: false, error: `${criterion.label} must be a whole number from 1 to 10.` };
    }
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
    },
    { onConflict: "registration_id,judge_id" },
  );

  if (error) {
    return { success: false, error: "Could not save your score. Make sure this team is assigned to you." };
  }
  return { success: true };
}
