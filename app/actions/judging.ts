"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "@/app/actions/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { JUDGING_REPORT_SELECT, JUDGING_TEAM_SELECT, mapJudgingReportTeam, mapJudgingTeams, type JudgingReportTeam } from "@/lib/judging-load";
import { judgingDetailsCsv } from "@/lib/judging-csv";
import { reportFileBase } from "@/lib/report-file-name";
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

type CsvResult = { success: true; csv: string; filename: string } | { success: false; error: string };

/**
 * Admin (or super-admin) only: the judging report as a CSV (lib/judging-csv.ts),
 * one row per judge per team — for one team (its page's button) or, with
 * no team, every team that has judges or scores (the Judging page and the zip).
 * `log: false` skips the audit entry (the zip logs once for the batch).
 */
export async function exportJudgingCsv(teamId?: string, opts: { log?: boolean } = {}): Promise<CsvResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can export judging reports." };
  }
  const supabase = await createClient();
  let query = supabase.from("teams").select(JUDGING_REPORT_SELECT).order("name");
  if (teamId) query = query.eq("id", teamId);
  const { data, error } = await query;
  if (error) {
    console.error("exportJudgingCsv failed:", error);
    return { success: false, error: "Could not load judging data." };
  }
  const teams = (data ?? [])
    .map(mapJudgingReportTeam)
    .filter((t): t is JudgingReportTeam => t !== null)
    .filter((t) => teamId || t.assignments.length > 0 || t.scores.length > 0);
  if (teamId && teams.length === 0) {
    return { success: false, error: "Team not found." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = teamId ? `${reportFileBase(teams[0].name, teams[0].entryCode)}-judging.csv` : `gignite-judging-details-${today}.csv`;
  if (opts.log !== false) {
    await logAuditEvent(
      supabase,
      teamId ? "team.judging_csv_downloaded" : "judging.csv_exported",
      teamId ? { targetType: "team", targetId: teamId, targetLabel: filename } : { metadata: { teamCount: teams.length } },
    );
  }
  return { success: true, csv: judgingDetailsCsv(teams), filename };
}
