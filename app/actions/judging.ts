"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "@/app/actions/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { JUDGING_TEAM_SELECT, mapJudgingTeams } from "@/lib/judging-load";
import type { JudgingJudge, JudgingTeam } from "@/lib/judging";

export type JudgingOverview =
  | { success: true; teams: JudgingTeam[]; judges: JudgingJudge[] }
  | { success: false; error: string };

/**
 * Admin (or super-admin) only: every registration's judge assignments and
 * scores (no comments), plus every judge account — the Judging page.
 */
export async function getJudgingOverview(): Promise<JudgingOverview> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can view judging statistics." };
  }
  const supabase = await createClient();
  const [teamsRes, judgesRes] = await Promise.all([
    supabase.from("teams").select(JUDGING_TEAM_SELECT).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "judge").order("full_name"),
  ]);
  if (teamsRes.error || judgesRes.error) {
    console.error("getJudgingOverview failed:", teamsRes.error ?? judgesRes.error);
    return { success: false, error: "Could not load judging data." };
  }
  return {
    success: true,
    teams: mapJudgingTeams(teamsRes.data ?? []),
    judges: (judgesRes.data ?? []).map((j) => ({ id: j.id as string, name: (j.full_name as string) || (j.email as string), email: j.email as string })),
  };
}

/** Records the judging-reports zip download once for the whole batch. */
export async function logJudgingReportsZip(teamCount: number): Promise<void> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return;
  const supabase = await createClient();
  await logAuditEvent(supabase, "judging.reports_exported", { metadata: { teamCount } });
}
