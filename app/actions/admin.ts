"use server";

import { after } from "next/server";
import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { notifyDetailsUpdated, notifyVerification } from "@/lib/email/deliver";
import { csvField } from "@/lib/csv";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { getMfaState, mfaSatisfied } from "@/lib/staff-mfa";
import { registrationEditSchema, type RegistrationEdit } from "@/lib/validations/registration-edit";
import { ambassadorFormValueToNumber, ambassadorLabel } from "@/lib/ambassador";
import { reportFileBase } from "@/lib/report-file-name";
import {
  TEAM_SELECT,
  TEAM_LIST_SELECT,
  mapListRow,
  mapTeamRow,
  type RawTeamRow,
  type AdminAssignment,
  type AdminJudge,
  type AdminTeam,
  type RegistrationReviewState,
  type VerificationStatus,
} from "@/lib/admin-teams";

export type {
  AdminMember,
  AdminJudge,
  AdminAssignment,
  AdminJudgeScore,
  AdminRegistration,
  AdminTeam,
  RawTeamRow,
  VerificationStatus,
  RegistrationReviewState,
} from "@/lib/admin-teams";

/**
 * Returns the caller's profile role, or null if not signed in, no profile,
 * or the session still owes the 2FA code (it has an authenticator app, or
 * is the super-admin — see lib/staff-mfa.ts). Some actions use the
 * service-role client after this check, so it must hold the same line as
 * the database does.
 */
export async function getCallerRole(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return null;
  if (!mfaSatisfied(await getMfaState(supabase, user), profile.role)) return null;

  return { userId: user.id, role: profile.role };
}

const REGISTRATION_STATUSES = ["submitted", "under_review", "shortlisted", "rejected"] as const;

/**
 * Staff-only data fetch: all teams with their members and registration.
 * Named for its original caller (the admin dashboard), but RLS scopes the
 * underlying query per role regardless of who calls it — an admin session
 * gets every team, a judge session would only get teams assigned to them.
 * The judge dashboard uses its own getMyAssignedTeams() in app/actions/judge.ts
 * instead, mostly so the intent reads clearly at the call site.
 */
export async function getTeamsForAdmin(): Promise<
  { success: true; teams: AdminTeam[] } | { success: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    // RLS denies this entirely for non-staff — that shows up here as an
    // empty result or a permissions error depending on the query shape,
    // not a thrown exception, so this mostly catches genuine DB issues.
    return { success: false, error: "Could not load teams." };
  }

  return { success: true, teams: (data ?? []).map((t) => mapTeamRow(t as unknown as RawTeamRow)) };
}

export type AdminTeamQuery = {
  search?: string;
  status?: string | null;
  verification?: string | null;
  theme?: string | null;
  district?: string | null;
  newestFirst?: boolean;
  offset?: number;
  limit?: number;
};

type TeamPageResult = { success: true; teams: AdminTeam[]; total: number } | { success: false; error: string };

/** Loads TEAM_LIST_SELECT rows for these ids, in the given order (deleted teams drop out). */
async function loadListRows(ids: string[]): Promise<AdminTeam[] | null> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").select(TEAM_LIST_SELECT).in("id", ids);
  if (error) return null;
  const byId = new Map((data ?? []).map((row) => [(row as { id: string }).id, mapListRow(row as Record<string, unknown>)]));
  return ids.map((id) => byId.get(id)).filter((t): t is AdminTeam => Boolean(t));
}

/**
 * Admin only: one page of the Registrations list. Search, filters and
 * sorting run in the database (admin_team_page) so the dashboard never
 * downloads every team; the list loads more as the admin scrolls.
 */
export async function listAdminTeams(query: AdminTeamQuery): Promise<TeamPageResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can view registrations." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_team_page", {
    p_search: query.search?.trim() || null,
    p_status: query.status || null,
    p_verification: query.verification || null,
    p_theme: query.theme || null,
    p_district: query.district || null,
    p_newest_first: query.newestFirst ?? true,
    p_offset: Math.max(0, query.offset ?? 0),
    p_limit: Math.min(100, Math.max(1, query.limit ?? 30)),
  });
  if (error || !data) {
    return { success: false, error: "Could not load teams." };
  }
  const page = data as { ids: string[]; total: number };
  const teams = await loadListRows(page.ids);
  if (!teams) {
    return { success: false, error: "Could not load teams." };
  }
  return { success: true, teams, total: page.total };
}

/** Admin only: fresh rows for the teams already on screen (the list's live refresh). */
export async function refreshAdminTeams(ids: string[]): Promise<{ success: true; teams: AdminTeam[] } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can view registrations." };
  }
  const teams = await loadListRows(ids.slice(0, 500));
  return teams ? { success: true, teams } : { success: false, error: "Could not refresh teams." };
}

export type RegistrationStats = {
  total: number;
  byStatus: Record<string, number>;
  byTheme: Record<string, number>;
  byVerification: Record<string, number>;
  /** Registrations per day (YYYY-MM-DD, India time), last 8 days. */
  daily: Record<string, number>;
};

/** Admin only: the totals behind the dashboard charts (admin_registration_stats, ~1 KB). */
export async function getRegistrationStats(): Promise<{ success: true; stats: RegistrationStats } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can view registrations." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_registration_stats");
  if (error || !data) {
    return { success: false, error: "Could not load the registration totals." };
  }
  const raw = data as { total: number; by_status: Record<string, number>; by_theme: Record<string, number>; by_verification: Record<string, number>; daily: Record<string, number> };
  return {
    success: true,
    stats: { total: raw.total, byStatus: raw.by_status, byTheme: raw.by_theme, byVerification: raw.by_verification, daily: raw.daily },
  };
}

/** Staff-only data fetch: one team by id, for the detail page. */
export async function getTeamDetail(
  teamId: string,
): Promise<{ success: true; team: AdminTeam } | { success: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("teams").select(TEAM_SELECT).eq("id", teamId).single();

  if (error || !data) {
    return { success: false, error: "Team not found." };
  }

  return { success: true, team: mapTeamRow(data as unknown as RawTeamRow) };
}

/** Staff-only: list all judge accounts, for the assignment picker. */
export async function getJudges(): Promise<
  { success: true; judges: AdminJudge[] } | { success: false; error: string }
> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "judge")
    .order("full_name");

  if (error) {
    return { success: false, error: "Could not load judges." };
  }
  return { success: true, judges: data ?? [] };
}

type AssignResult =
  | { success: true; assignment: AdminAssignment }
  | { success: false; error: string; stale?: boolean };

const ASSIGN_GUARD_MESSAGES: Record<string, string> = {
  not_verified: "Verify this team's eligibility before assigning judges.",
  already_decided: "This team already has a final decision, so no more judges can be assigned.",
};

/**
 * Admin (or super-admin) only: assign a judge to review a registration.
 * Safe against two admins acting at once: the (registration_id, judge_id)
 * unique constraint turns a duplicate into a clear "already assigned"
 * (flagged `stale` so the UI re-syncs to show it), and the
 * registration_assignments_insert_guard trigger re-checks verification and
 * decision state under a row lock — see
 * supabase/migrations/20260923040000_admin_concurrency.sql.
 */
export async function assignJudge(registrationId: string, judgeId: string): Promise<AssignResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can assign judges." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_assignments")
    .insert({
      registration_id: registrationId,
      judge_id: judgeId,
      assigned_by: caller.userId,
    })
    .select("id, judge_id, profiles!registration_assignments_judge_id_fkey ( full_name )")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "That judge is already assigned — another admin may have just done it.", stale: true };
    }
    if (error?.hint && ASSIGN_GUARD_MESSAGES[error.hint]) {
      return { success: false, error: ASSIGN_GUARD_MESSAGES[error.hint], stale: true };
    }
    return { success: false, error: "Could not assign judge." };
  }
  await logAuditEvent(supabase, "judge.assigned", {
    targetType: "registration",
    targetId: registrationId,
    metadata: { judgeId },
  });
  const judge = data.profiles as unknown as { full_name: string } | null;
  revalidateDashboard();
  return {
    success: true,
    assignment: { id: data.id, judge_id: data.judge_id, judge_name: judge?.full_name ?? "Unknown" },
  };
}

type UnassignResult = { success: true; alreadyRemoved: boolean } | { success: false; error: string };

/**
 * Admin (or super-admin) only: remove a judge assignment. If another admin
 * already removed it, that's reported (alreadyRemoved) rather than
 * pretending this call did it, and nothing is audit-logged twice.
 */
export async function unassignJudge(assignmentId: string): Promise<UnassignResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can unassign judges." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_assignments")
    .delete()
    .eq("id", assignmentId)
    .select("id");
  if (error) {
    return { success: false, error: "Could not remove assignment." };
  }
  if (!data || data.length === 0) {
    revalidateDashboard();
    return { success: true, alreadyRemoved: true };
  }
  await logAuditEvent(supabase, "judge.unassigned", {
    targetType: "registration_assignment",
    targetId: assignmentId,
  });
  revalidateDashboard();
  return { success: true, alreadyRemoved: false };
}

type DeckUrlResult = { success: true; url: string } | { success: false; error: string };

/**
 * A short-lived signed URL to view/download an uploaded deck — for admins
 * (any team) and judges (only teams assigned to them). The
 * registration-decks bucket has no direct read policy for anyone, so this
 * is the only path in. The URL is minted with the service-role client,
 * which would sign any path it's given, so the path must first be the
 * deck of a registration the caller can read under RLS (admins: all;
 * judges: assigned only; volunteers and others: none).
 */
export async function getDeckDownloadUrl(deckPath: string): Promise<DeckUrlResult> {
  const caller = await getCallerRole();
  if (!caller || !["admin", "judge", "super_admin"].includes(caller.role)) {
    return { success: false, error: "Only admins and assigned judges can open decks." };
  }
  if (!deckPath) {
    return { success: false, error: "No deck uploaded." };
  }

  const supabase = await createClient();
  const { data: registration } = await supabase
    .from("registrations")
    .select("id")
    .eq("deck_path", deckPath)
    .limit(1)
    .maybeSingle();
  if (!registration) {
    return { success: false, error: "You don't have access to this deck." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("registration-decks")
    .createSignedUrl(deckPath, 60 * 5); // 5 minutes

  if (error || !data) {
    return { success: false, error: "Could not generate a download link." };
  }
  return { success: true, url: data.signedUrl };
}

type IdCardPathsResult =
  | { success: true; paths: Record<string, string | null> }
  | { success: false; error: string };

/**
 * Admin-only: member id -> id_card_path for a team. Deliberately NOT part
 * of TEAM_SELECT/mapTeamRow (unlike deck_path, which does ride along there
 * for admin/judge/volunteer alike) — a judge or volunteer session should
 * never receive an id_card_path string at all, even inertly, so this
 * re-queries team_members directly and is gated stricter than the deck
 * actions above (admin only, not admin/judge/volunteer).
 */
export async function getTeamMemberIdCardPaths(teamId: string): Promise<IdCardPathsResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Admins only." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("team_members").select("id, id_card_path").eq("team_id", teamId);
  if (error) {
    return { success: false, error: "Could not load ID cards." };
  }

  const paths: Record<string, string | null> = {};
  for (const row of data ?? []) {
    paths[row.id] = row.id_card_path;
  }
  return { success: true, paths };
}

/**
 * Admin-only: a short-lived signed URL for one member's ID-card photo.
 * Same shape as getDeckDownloadUrl, but gated to admin only — the
 * member-id-cards bucket has no read policy for anyone either, so this is
 * the only path in.
 */
export async function getMemberIdCardDownloadUrl(idCardPath: string): Promise<DeckUrlResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Admins only." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("member-id-cards")
    .createSignedUrl(idCardPath, 60 * 5); // 5 minutes

  if (error || !data) {
    return { success: false, error: "Could not generate a download link." };
  }
  return { success: true, url: data.signedUrl };
}

const REVIEW_STATE_SELECT = `version, status, status_changed_at,
  status_changed_by:profiles!registrations_status_changed_by_fkey ( full_name ),
  verification_status, verification_note, verification_decided_at,
  verification_decided_by:profiles!registrations_verification_decided_by_fkey ( full_name )`;

type RawReviewState = {
  version: number;
  status: RegistrationReviewState["status"];
  status_changed_at: string | null;
  status_changed_by: { full_name: string } | null;
  verification_status: VerificationStatus;
  verification_note: string | null;
  verification_decided_at: string | null;
  verification_decided_by: { full_name: string } | null;
};

function toReviewState(raw: RawReviewState): RegistrationReviewState {
  return {
    version: raw.version,
    status: raw.status,
    statusChangedAt: raw.status_changed_at,
    statusChangedByName: raw.status_changed_by?.full_name ?? null,
    verification: {
      status: raw.verification_status,
      note: raw.verification_note,
      decidedAt: raw.verification_decided_at,
      decidedByName: raw.verification_decided_by?.full_name ?? null,
    },
  };
}

type ReviewStateResult =
  | { success: true; state: RegistrationReviewState }
  /** `state`, when present, is the registration's current state after a conflict — the UI should show it. */
  | { success: false; error: string; state?: RegistrationReviewState };

const REVIEW_GUARD_MESSAGES: Record<string, string> = {
  has_assignments: "Unassign this team's judges before changing its verification.",
  no_judges: "Assign judges and collect their scores before shortlisting or rejecting.",
  scores_incomplete: "Every assigned judge must submit their score before shortlisting or rejecting.",
};

/**
 * Applies an admin's change to a registration only if nobody else changed
 * it since they loaded it (expectedVersion). On a mismatch, returns the
 * current state and who last changed the status, so the admin sees what
 * happened instead of overwriting it.
 */
async function updateRegistrationIfCurrent(
  registrationId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<ReviewStateResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .update(patch)
    .eq("id", registrationId)
    .eq("version", expectedVersion)
    .select(REVIEW_STATE_SELECT)
    .maybeSingle();

  if (error) {
    if (error.hint && REVIEW_GUARD_MESSAGES[error.hint]) {
      return { success: false, error: REVIEW_GUARD_MESSAGES[error.hint] };
    }
    return { success: false, error: "Could not save the change." };
  }
  if (data) {
    return { success: true, state: toReviewState(data as unknown as RawReviewState) };
  }

  const { data: current } = await supabase
    .from("registrations")
    .select(REVIEW_STATE_SELECT)
    .eq("id", registrationId)
    .maybeSingle();
  if (!current) {
    return { success: false, error: "Registration not found." };
  }
  const state = toReviewState(current as unknown as RawReviewState);
  const by = state.statusChangedByName ? ` by ${state.statusChangedByName}` : "";
  return {
    success: false,
    error: `Another admin updated this team${by} while you were viewing it. Showing the latest — check it and try again if still needed.`,
    state,
  };
}

/**
 * Admin (or super-admin) only: change a registration's review status.
 * Refused if another admin changed the registration since expectedVersion,
 * and — enforced by the DB trigger — shortlisted/rejected need every
 * assigned judge's submitted score first.
 */
export async function updateRegistrationStatus(
  registrationId: string,
  status: string,
  expectedVersion: number,
): Promise<ReviewStateResult> {
  if (!REGISTRATION_STATUSES.includes(status as (typeof REGISTRATION_STATUSES)[number])) {
    return { success: false, error: "Invalid status." };
  }

  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can change registration status." };
  }

  // RLS's registrations_update_admin policy enforces is_admin() again at the
  // DB level regardless — the check above is just for a clean error message.
  const result = await updateRegistrationIfCurrent(registrationId, expectedVersion, { status });
  if (result.success) {
    const supabase = await createClient();
    await logAuditEvent(supabase, "registration.status_changed", {
      targetType: "registration",
      targetId: registrationId,
      metadata: { status },
    });
    revalidateDashboard();
  }
  return result;
}

const VERIFICATION_STATUSES = ["pending", "verified", "needs_correction", "ineligible"] as const;

/**
 * Admin (or super-admin) only: record the eligibility check for a
 * registration (ID cards / details checked → verified, needs correction, or
 * ineligible). Only verified registrations can be assigned judges. A note is
 * required for "needs_correction" and "ineligible" — it's emailed to the
 * team leader (notifyVerification). Who/when is stamped by the
 * registrations_verification_guard trigger from the session, which also
 * refuses to un-verify an entry that still has judges assigned. Same
 * expectedVersion conflict check as updateRegistrationStatus.
 */
export async function setVerificationStatus(
  registrationId: string,
  status: string,
  expectedVersion: number,
  note?: string,
): Promise<ReviewStateResult> {
  if (!VERIFICATION_STATUSES.includes(status as (typeof VERIFICATION_STATUSES)[number])) {
    return { success: false, error: "Invalid verification status." };
  }
  const trimmedNote = note?.trim() || null;
  if ((status === "needs_correction" || status === "ineligible") && !trimmedNote) {
    return { success: false, error: "Write a note saying what's wrong — it's emailed to the team leader." };
  }
  if (trimmedNote && trimmedNote.length > 1000) {
    return { success: false, error: "Keep the note under 1000 characters." };
  }

  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can verify registrations." };
  }

  const result = await updateRegistrationIfCurrent(registrationId, expectedVersion, {
    verification_status: status,
    verification_note: trimmedNote,
  });
  if (result.success) {
    const supabase = await createClient();
    await logAuditEvent(supabase, "registration.verification_changed", {
      targetType: "registration",
      targetId: registrationId,
      metadata: { verificationStatus: status, ...(trimmedNote ? { note: trimmedNote } : {}) },
    });
    revalidateDashboard();
    if (status === "needs_correction" || status === "ineligible") after(() => notifyVerification(registrationId));
  }
  return result;
}

type CsvResult = { success: true; csv: string; filename: string } | { success: false; error: string };

// The leader plus up to 4 members (a team is 2–5 people).
const MAX_OTHER_MEMBERS = 4;

const TEAM_CSV_HEADER = [
  "Team Name",
  "Team ID",
  "Team Leader Name",
  "Team Leader Phone",
  // The leader is member 1, so the others are Member 2 to Member 5.
  ...Array.from({ length: MAX_OTHER_MEMBERS }, (_, i) => `Member ${i + 2}`),
  "College Name",
  "Chosen Track",
];

/**
 * The team contact sheet both exports use. Each member (leader excluded)
 * gets their own column, in member order, as "Name; Phone"; a smaller
 * team leaves the rest empty.
 */
function teamsCsv(teams: AdminTeam[]): string {
  const rows = teams.map((team) => {
    const leader = team.members.find((m) => m.is_leader);
    const others = team.members.filter((m) => !m.is_leader);
    const memberCells = Array.from({ length: MAX_OTHER_MEMBERS }, (_, i) =>
      others[i] ? `${others[i].full_name}; ${others[i].phone}` : "",
    );
    return [
      team.name,
      team.entry_code,
      leader?.full_name ?? "",
      leader?.phone ?? "",
      ...memberCells,
      leader?.college ?? team.members[0]?.college ?? "",
      team.ai_theme,
    ].map(csvField);
  });
  return [TEAM_CSV_HEADER.map(csvField).join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Admin (or super-admin) only: a CSV of every registered team for offline
 * use (contact lists, badges). Includes phone numbers, so — unlike the
 * plain team reads above, which RLS's is_staff() happily allows for judges
 * too — this one gates on role explicitly. Judges shouldn't be able to
 * pull every team's contact info in one shot; it's the same bias/privacy
 * concern as hiding member contact details on the judge team-detail view.
 */
export async function exportRegistrationsCsv(): Promise<CsvResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can export registrations." };
  }

  const result = await getTeamsForAdmin();
  if (!result.success) {
    return result;
  }

  const csv = teamsCsv(result.teams);
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  await logAuditEvent(supabase, "registrations.exported", { metadata: { teamCount: result.teams.length } });

  return { success: true, csv, filename: `gignite-all-teams-${today}.csv` };
}

/**
 * Admin (or super-admin) only: the same sheet for the teams shortlisted
 * for the Grand Finale. Only once results are published (the decisions are
 * final then); built from the current data each time it's downloaded.
 */
export async function exportFinaleShortlistCsv(): Promise<CsvResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can export the finale shortlist." };
  }

  const supabase = await createClient();
  const { data: publication } = await supabase.from("results_publication").select("is_published").eq("id", true).single();
  if (!publication?.is_published) {
    return { success: false, error: "Publish the results first — the finale shortlist is available after that." };
  }

  const result = await getTeamsForAdmin();
  if (!result.success) {
    return result;
  }
  const shortlisted = result.teams.filter((t) => t.registration?.status === "shortlisted");

  const csv = teamsCsv(shortlisted);
  const today = new Date().toISOString().slice(0, 10);
  await logAuditEvent(supabase, "registrations.finale_exported", { metadata: { teamCount: shortlisted.length } });

  return { success: true, csv, filename: `gignite-finale-shortlist-${today}.csv` };
}

// The idea answers, labelled as on the registration form (components/registration/step-idea.tsx).
const DECK_CSV_HEADER = ["Team Name", "Team ID", "The Problem", "Your Solution", "AI + Tech", "The Impact"];

type DeckCsvRow = {
  name: string;
  entry_code: string;
  registrations: Record<string, string> | Record<string, string>[] | null;
};

/**
 * Admin (or super-admin) only: each team's idea answers — every team, or
 * (once results are published) the teams shortlisted for the Grand Finale.
 * No contact details, just the team and what they wrote.
 */
export async function exportDeckCsv(scope: "all" | "shortlist"): Promise<CsvResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can export the deck CSV." };
  }

  const supabase = await createClient();
  if (scope === "shortlist") {
    const { data: publication } = await supabase.from("results_publication").select("is_published").eq("id", true).single();
    if (!publication?.is_published) {
      return { success: false, error: "Publish the results first — the finale shortlist is available after that." };
    }
  }

  let query = supabase
    .from("teams")
    .select("name, entry_code, registrations!inner(status, problem_statement, proposed_solution, ai_approach, expected_impact)")
    .order("created_at", { ascending: false });
  if (scope === "shortlist") query = query.eq("registrations.status", "shortlisted");
  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Could not load the teams." };
  }

  const rows = ((data ?? []) as unknown as DeckCsvRow[]).map((team) => {
    const reg = (Array.isArray(team.registrations) ? team.registrations[0] : team.registrations) ?? {};
    return [
      team.name,
      team.entry_code,
      reg.problem_statement ?? "",
      reg.proposed_solution ?? "",
      reg.ai_approach ?? "",
      reg.expected_impact ?? "",
    ].map(csvField);
  });
  const csv = [DECK_CSV_HEADER.map(csvField).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const today = new Date().toISOString().slice(0, 10);

  await logAuditEvent(supabase, "registrations.deck_exported", { metadata: { scope, teamCount: rows.length } });

  return {
    success: true,
    csv,
    filename: scope === "all" ? `gignite-deck-all-teams-${today}.csv` : `gignite-deck-finale-shortlist-${today}.csv`,
  };
}

/**
 * Admin (or super-admin) only: the teams for a "zip of team reports"
 * download — every team, or (once results are published) the teams
 * shortlisted for the Grand Finale. The browser then fetches each team's
 * report (app/(admin)/dashboard/team-report/[teamId]/route.ts) and builds
 * the zip itself. Logged once per download.
 */
export async function listTeamsForReports(
  scope: "all" | "shortlist",
): Promise<{ success: true; teams: { id: string; fileBase: string }[] } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can download team reports." };
  }
  const supabase = await createClient();
  if (scope === "shortlist") {
    const { data: publication } = await supabase.from("results_publication").select("is_published").eq("id", true).single();
    if (!publication?.is_published) {
      return { success: false, error: "Publish the results first — the finale shortlist is available after that." };
    }
  }

  let query = supabase.from("teams").select("id, name, entry_code, registrations!inner(status)").order("name");
  if (scope === "shortlist") query = query.eq("registrations.status", "shortlisted");
  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Could not load the teams." };
  }

  const teams = (data ?? []).map((t) => ({ id: t.id as string, fileBase: reportFileBase(t.name as string, t.entry_code as string) }));
  await logAuditEvent(supabase, "registrations.reports_exported", { metadata: { scope, teamCount: teams.length } });
  return { success: true, teams };
}

type DeleteResult = { success: true } | { success: false; error: string };

/**
 * Super-admin only: permanently delete a team's entire registration (team,
 * members, idea, judge assignments and scores — all cascade from the
 * `teams` row, see teams_delete_super_admin's own comment). Deliberately
 * stricter than isAdminLevelRole: a regular admin can change status or
 * assign judges but not destroy a submission outright.
 *
 * Storage cleanup (uploaded decks/ID cards) is best-effort after the DB
 * delete succeeds — those files live outside Postgres, so nothing cascades
 * them automatically, but a cleanup failure there shouldn't make the
 * (already-successful) deletion look like it failed.
 */
export async function deleteRegistration(teamId: string): Promise<DeleteResult> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can delete a registration." };
  }

  const supabase = await createClient();

  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).single();
  if (!team) {
    return { success: false, error: "Team not found." };
  }

  const [{ data: members }, { data: registration }] = await Promise.all([
    supabase.from("team_members").select("id_card_path").eq("team_id", teamId),
    supabase.from("registrations").select("deck_path").eq("team_id", teamId).maybeSingle(),
  ]);

  // RLS's teams_delete_super_admin policy enforces is_super_admin() again
  // at the DB level regardless — the caller.role check above is just for a
  // clean error message before doing any of the reads above.
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) {
    return { success: false, error: "Could not delete registration." };
  }

  await logAuditEvent(supabase, "registration.deleted", {
    targetType: "team",
    targetId: teamId,
    targetLabel: team.name,
    metadata: { memberCount: members?.length ?? 0 },
  });

  const idCardPaths = (members ?? []).map((m) => m.id_card_path).filter((p): p is string => Boolean(p));
  const admin = createAdminClient();
  if (idCardPaths.length > 0) {
    const { error: storageError } = await admin.storage.from("member-id-cards").remove(idCardPaths);
    if (storageError) {
      console.error(`Could not clean up ID cards for deleted team ${teamId}:`, storageError.message);
    }
  }
  if (registration?.deck_path) {
    const { error: deckError } = await admin.storage.from("registration-decks").remove([registration.deck_path]);
    if (deckError) {
      console.error(`Could not clean up deck for deleted team ${teamId}:`, deckError.message);
    }
  }
  // Generated team reports (lib/team-report.ts) hold the same ID photos and
  // contacts — they go too.
  const { data: reports } = await admin.storage.from("team-reports").list(teamId, { limit: 100 });
  if (reports && reports.length > 0) {
    const { error: reportError } = await admin.storage.from("team-reports").remove(reports.map((f) => `${teamId}/${f.name}`));
    if (reportError) {
      console.error(`Could not clean up reports for deleted team ${teamId}:`, reportError.message);
    }
  }

  revalidateDashboard();

  return { success: true };
}

type EditDetailsResult =
  | { success: true; addedMembers: number; verificationReset: boolean }
  | { success: false; error: string; stale?: boolean };

const EDIT_GUARD_MESSAGES: Record<string, string> = {
  judging_started: "Judging has started for this team — its details are locked. Unassign all judges to edit.",
  name_taken: "Another team already has this name.",
  name_similar: "This name is too close to another team's name.",
  bad_member: "Member list is out of date — reload the page.",
  not_found: "Registration not found.",
  invalid_ambassador: "That ambassador ID is outside the current range or was deleted.",
  team_full: "A team can have at most 5 members.",
};

/**
 * Super-admin only: correct a submitted registration when a participant
 * reports a mistake — team details, member details, the idea answers, and
 * replacing a member's ID card or the deck (uploaded with createUploadUrl
 * first). Refused once any judge is assigned, or if someone else changed
 * the registration since expectedVersion. The whole edit is applied in one
 * transaction by super_admin_update_registration()
 * (supabase/migrations/20261002000000_super_admin_edit_registration.sql);
 * every changed field is audit-logged as old → new.
 */
export async function updateRegistrationDetails(
  teamId: string,
  expectedVersion: number,
  input: RegistrationEdit,
  /** Email the leader the updated squad with every member's ID card. */
  notifyLeader = false,
): Promise<EditDetailsResult> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can edit a registration." };
  }

  const parsed = registrationEditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Some details are invalid." };
  }
  const edit = parsed.data;

  const current = await getTeamDetail(teamId);
  if (!current.success || !current.team.registration) {
    return { success: false, error: "Registration not found." };
  }
  const before = current.team;
  const reg = current.team.registration;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_admin_update_registration", {
    p_team_id: teamId,
    p_expected_version: expectedVersion,
    p_team: {
      name: edit.team.name,
      ai_theme: edit.team.aiTheme,
      district: edit.team.district,
      college: edit.team.college,
    },
    // A new member goes without an id (the function inserts it); its key
    // comes back in error hints.
    p_members: edit.members.map((m) => ({
      ...(m.isNew ? { key: m.id } : { id: m.id }),
      full_name: m.fullName,
      email: m.email,
      phone: m.phone,
      branch: m.branch,
      year: m.year,
      role_in_team: m.isLeader ? "" : m.roleInTeam,
      id_card_path: m.idCardPath,
    })),
    p_registration: {
      problem_statement: edit.idea.problemStatement,
      proposed_solution: edit.idea.proposedSolution,
      ai_approach: edit.idea.aiApproach,
      expected_impact: edit.idea.expectedImpact,
      supporting_link: edit.idea.supportingLink ?? "",
      deck_path: edit.idea.deckPath,
      ambassador_number: ambassadorFormValueToNumber(edit.ambassador),
    },
  });

  if (error) {
    const hint = error.hint ?? "";
    if (hint === "stale") {
      return {
        success: false,
        stale: true,
        error: "Someone else changed this team while you were editing. Showing the latest — make your change again.",
      };
    }
    const [kind, memberId] = hint.split(":");
    if (kind === "id_card_required") {
      const who = edit.members.find((m) => m.id === memberId)?.fullName || "the new member";
      return { success: false, error: `Upload an ID card for ${who}.` };
    }
    if (kind === "email_taken" || kind === "phone_taken") {
      const who = edit.members.find((m) => m.id === memberId)?.fullName ?? "a member";
      return {
        success: false,
        error: `The ${kind === "email_taken" ? "email" : "phone number"} for ${who} is already registered with another team.`,
      };
    }
    if (EDIT_GUARD_MESSAGES[hint]) {
      return { success: false, error: EDIT_GUARD_MESSAGES[hint] };
    }
    if (error.code === "23514") {
      return { success: false, error: "Some details are in the wrong format — check the highlighted rules and try again." };
    }
    if (error.code === "42501") {
      return { success: false, error: "That file wasn't uploaded from this account — upload it again." };
    }
    return { success: false, error: "Could not save the changes." };
  }

  // Old → new for everything that actually changed, for the audit log.
  const changes: { field: string; member?: string; from?: string | null; to?: string | null }[] = [];
  const note = (field: string, from: string | null, to: string | null, member?: string) => {
    if ((from ?? "") !== (to ?? "")) changes.push({ field, member, from, to });
  };
  note("Team name", before.name, edit.team.name);
  note("AI theme", before.ai_theme, edit.team.aiTheme);
  note("District", before.district, edit.team.district);
  note("College", before.members[0]?.college ?? null, edit.team.college);
  for (const m of edit.members) {
    if (m.isNew) {
      changes.push({ field: "Member added", member: m.fullName, to: `${m.email} · ${m.phone}` });
      continue;
    }
    const old = before.members.find((b) => b.id === m.id);
    if (!old) continue;
    const who = `${old.full_name} (${old.member_code})`;
    note("Name", old.full_name, m.fullName, who);
    note("Email", old.email, m.email, who);
    note("Phone", old.phone, m.phone, who);
    note("Branch", old.branch, m.branch, who);
    note("Year", old.year, m.year, who);
    if (!m.isLeader) note("Role", old.role_in_team, m.roleInTeam, who);
    if (m.idCardPath) changes.push({ field: "ID card replaced", member: who });
  }
  note("Problem statement", reg.problem_statement, edit.idea.problemStatement);
  note("Proposed solution", reg.proposed_solution, edit.idea.proposedSolution);
  note("AI approach", reg.ai_approach, edit.idea.aiApproach);
  note("Expected impact", reg.expected_impact, edit.idea.expectedImpact);
  note("Supporting link", reg.supporting_link, edit.idea.supportingLink || null);
  if (edit.idea.deckPath) changes.push({ field: "Deck replaced" });
  note(
    "Ambassador",
    ambassadorLabel(reg.ambassador_number),
    ambassadorLabel(ambassadorFormValueToNumber(edit.ambassador)),
  );

  await logAuditEvent(supabase, "registration.details_edited", {
    targetType: "team",
    targetId: teamId,
    targetLabel: edit.team.name,
    metadata: { changes, ...(notifyLeader ? { leaderEmailed: true } : {}) },
  });

  // The replaced files are no longer referenced anywhere — best-effort
  // cleanup, like deleteRegistration.
  const replaced = ((data as { replaced_files?: { bucket: string; path: string }[] } | null)?.replaced_files ?? []);
  if (replaced.length > 0) {
    const admin = createAdminClient();
    for (const file of replaced) {
      const { error: storageError } = await admin.storage.from(file.bucket).remove([file.path]);
      if (storageError) {
        console.error(`Could not remove replaced file for team ${teamId}:`, storageError.message);
      }
    }
  }

  revalidateDashboard();
  if (notifyLeader) after(() => notifyDetailsUpdated(teamId));
  const result = data as { added_members?: number; verification_reset?: boolean } | null;
  return {
    success: true,
    addedMembers: result?.added_members ?? 0,
    verificationReset: Boolean(result?.verification_reset),
  };
}

export type StaffAccount = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
  /** Whether they've set up two-factor sign-in (an authenticator app). */
  mfaEnabled?: boolean;
};

/** Super-admin only: every staff account (admin/judge/volunteer/super_admin), for the staff management page. */
export async function getStaffAccounts(): Promise<
  { success: true; staff: StaffAccount[] } | { success: false; error: string }
> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can view staff accounts." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Could not load staff accounts." };
  }

  // 2FA status per person — factors live in Supabase Auth, read with the
  // service role (the caller is already confirmed super-admin above).
  const admin = createAdminClient();
  const staff = await Promise.all(
    (data ?? []).map(async (s) => {
      const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: s.id });
      const mfaEnabled = (factors?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
      return { ...s, mfaEnabled };
    }),
  );
  return { success: true, staff };
}

/**
 * Super-admin only: reset someone's two-factor sign-in (lost phone and
 * backup codes). Removes their authenticator and backup codes and ends their
 * sessions; they set up a new authenticator at their next sign-in. Not for
 * your own account — a locked-out super-admin uses the SQL in
 * supabase/migrations/20261006000000_staff_mfa.sql.
 */
export async function resetStaffMfa(userId: string): Promise<{ success: true } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can reset two-factor sign-in." };
  }
  if (userId === caller.userId) {
    return { success: false, error: "You can't reset your own two-factor sign-in here." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("email, role").eq("id", userId).single();
  if (!target) {
    return { success: false, error: "Account not found." };
  }

  const admin = createAdminClient();
  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listError) {
    return { success: false, error: "Could not reset two-factor sign-in." };
  }
  for (const f of factors?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (error) {
      return { success: false, error: "Could not reset two-factor sign-in." };
    }
  }
  await admin.from("staff_mfa_backup_codes").delete().eq("user_id", userId);
  // Ask again at their next sign-in whether to set it up (2FA is optional
  // except for the super-admin).
  await admin.from("profiles").update({ mfa_skipped_at: null }).eq("id", userId);
  // A session that already passed 2FA shouldn't outlive the reset.
  const { error: revokeError } = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
  if (revokeError) {
    console.error(`Could not end sessions after 2FA reset for ${userId}:`, revokeError.message);
  }

  await logAuditEvent(supabase, "auth.mfa_reset", {
    targetType: "profile",
    targetId: userId,
    targetLabel: target.email,
    metadata: { role: target.role },
  });
  revalidateDashboard();
  return { success: true };
}

const STAFF_ROLES = ["admin", "judge", "volunteer"] as const;
const STAFF_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

type CreateStaffResult = { success: true; account: StaffAccount } | { success: false; error: string };

/**
 * For createStaffAccount: an email that already has a Supabase login (and
 * no staff profile — those are listed on the Staff page). Refuses if the
 * email belongs to a registered team member, since a participant can't also
 * be staff. Otherwise confirms the email (needed for Google linking) and,
 * for a password account, sets the temporary password.
 */
async function adoptExistingLogin(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  fullName: string,
  password: string | null,
): Promise<{ success: true; user: { id: string; created_at: string } } | { success: false; error: string }> {
  let existing: { id: string; created_at: string } | null = null;
  for (let page = 1; page <= 100 && !existing; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { success: false, error: "Could not create the account." };
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) existing = { id: match.id, created_at: match.created_at };
    if (data.users.length < 200) break;
  }
  if (!existing) return { success: false, error: "An account with that email already exists." };

  const { data: profile } = await admin.from("profiles").select("role").eq("id", existing.id).maybeSingle();
  if (profile) return { success: false, error: "That email is already a staff account." };

  const { data: member } = await admin
    .from("team_members")
    .select("teams(name)")
    // Case-insensitive exact match: escape LIKE's wildcards (emails can contain "_").
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1)
    .maybeSingle();
  if (member) {
    const team = (member as { teams?: { name?: string } | null }).teams?.name;
    return {
      success: false,
      error: `That email is registered as a participant${team ? ` in team "${team}"` : ""} — a participant can't also be staff. Use a different email.`,
    };
  }

  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    email_confirm: true,
    ...(password ? { password } : {}),
    user_metadata: { full_name: fullName },
  });
  if (error) return { success: false, error: "Could not create the account." };
  return { success: true, user: existing };
}

/**
 * Super-admin only: create a staff account (judge, volunteer, or admin)
 * directly from the dashboard, instead of the terminal-only
 * scripts/seed-staff.mjs. Uses the service-role client for both steps —
 * auth.admin.createUser() always needs it, and there's no "admin can
 * update anyone's profile" RLS policy (profiles_update_own only allows a
 * self-update), so setting the requested role also has to go through it.
 * The password is chosen by the super-admin and must still be handed to
 * the new staff member out of band — there's no invite-email flow yet.
 * Deliberately can't create another super_admin from here — that role is
 * only ever seeded via scripts/seed-super-admin.mjs, not through the UI.
 */
export async function createStaffAccount(input: {
  email: string;
  fullName: string;
  role: string;
  /**
   * "google": no password at all — they can only use "Sign in with Google"
   * with this exact email. "password": a temporary password they must
   * change at first sign-in (Google sign-in works for them too).
   */
  signInMethod: "password" | "google";
  password?: string;
}): Promise<CreateStaffResult> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can create staff accounts." };
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!STAFF_EMAIL_RE.test(email)) {
    return { success: false, error: "Enter a valid email address." };
  }
  if (fullName.length < 2 || fullName.length > 80) {
    return { success: false, error: "Name must be 2-80 characters." };
  }
  if (!STAFF_ROLES.includes(input.role as (typeof STAFF_ROLES)[number])) {
    return { success: false, error: "Invalid role." };
  }
  const googleOnly = input.signInMethod === "google";
  if (!googleOnly && (input.password ?? "").length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  // email_confirm matters for Google: Supabase only links a Google sign-in
  // to an existing account whose email is confirmed.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    ...(googleOnly ? {} : { password: input.password }),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  let user: { id: string; created_at: string } | null = data?.user ?? null;
  // Whether this call created the login (and so may delete it on failure).
  let createdLogin = Boolean(user);
  if (error || !user) {
    if (error?.code !== "email_exists") {
      return { success: false, error: "Could not create the account." };
    }
    // The email already has a sign-in account with no staff profile —
    // typically someone who once opened the registration page (email code
    // or Google) without registering a team, or tried Google on the staff
    // site. Supabase allows one account per email, so that account becomes
    // the staff account. Never for a registered participant.
    const existing = await adoptExistingLogin(admin, email, fullName, googleOnly ? null : (input.password ?? null));
    if (!existing.success) return existing;
    user = existing.user;
    createdLogin = false;
  }
  const createdUser: { id: string; created_at: string } = user;

  // The staff profile is what grants dashboard access, and only ever gets
  // created here (or by scripts/seed-*.mjs) — signing up through Supabase
  // Auth never creates one (see 20260926000000_lock_down_staff_profiles.sql).
  // Upsert, not insert: harmless if an older trigger already added a row.
  // No temporary password to replace for a Google-only account.
  const { error: roleError } = await admin
    .from("profiles")
    .upsert(
      { id: createdUser.id, email, role: input.role, full_name: fullName, must_reset_password: !googleOnly },
      { onConflict: "id" },
    );

  if (roleError) {
    // Don't leave a login with no staff access behind — but never delete a
    // login that existed before this call.
    if (createdLogin) await admin.auth.admin.deleteUser(createdUser.id);
    return { success: false, error: "Could not create the account." };
  }

  // Logged via the caller's own session client (not the service-role
  // client above) so log_audit_event()'s auth.uid() resolves to the
  // super-admin who did this, not an anonymous service-role call.
  const supabase = await createClient();
  await logAuditEvent(supabase, "staff.created", {
    targetType: "profile",
    targetId: createdUser.id,
    targetLabel: email,
    metadata: {
      role: input.role,
      signInMethod: googleOnly ? "google" : "password",
      ...(createdLogin ? {} : { existingLogin: true }),
    },
  });

  // Return the real account (not something the client makes up) so the
  // staff list can delete it straight away without a page reload.
  revalidateDashboard();
  return {
    success: true,
    account: { id: createdUser.id, full_name: fullName, email, role: input.role, created_at: createdUser.created_at },
  };
}

type DeleteStaffResult = { success: true } | { success: false; error: string };

/**
 * Super-admin only: permanently delete a staff account (admin/judge/
 * volunteer). Deletes via auth.admin.deleteUser() rather than just the
 * profiles row — profiles.id references auth.users(id) on delete cascade,
 * so this also cascades to that staff member's registration_assignments
 * and judge_scores (both reference profiles(id) on delete cascade too).
 * For a judge, that means their submitted scores go with them, not just
 * the account — the UI warns about this before confirming.
 *
 * Can't delete a super_admin from here (mirrors createStaffAccount, which
 * can't create one either — that role only ever changes hands via
 * scripts/seed-super-admin.mjs) or the caller's own account, which would
 * otherwise leave the platform without a super-admin session to undo it.
 */
export async function deleteStaffAccount(userId: string): Promise<DeleteStaffResult> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can delete staff accounts." };
  }
  if (userId === caller.userId) {
    return { success: false, error: "You can't delete your own account." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("email, role").eq("id", userId).single();
  if (!target) {
    return { success: false, error: "Account not found." };
  }
  if (target.role === "super_admin") {
    return { success: false, error: "Can't delete a super-admin account here." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { success: false, error: "Could not delete the account." };
  }

  await logAuditEvent(supabase, "staff.deleted", {
    targetType: "profile",
    targetId: userId,
    targetLabel: target.email,
    metadata: { role: target.role },
  });

  revalidateDashboard();

  return { success: true };
}
