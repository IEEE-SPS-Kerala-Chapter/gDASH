"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import {
  TEAM_SELECT,
  mapTeamRow,
  type RawTeamRow,
  type AdminJudge,
  type AdminTeam,
} from "@/lib/admin-teams";

export type { AdminMember, AdminJudge, AdminAssignment, AdminJudgeScore, AdminRegistration, AdminTeam, RawTeamRow } from "@/lib/admin-teams";

/** Returns the caller's profile role, or null if not signed in / no profile. */
export async function getCallerRole(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return null;

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

type AssignResult = { success: true; assignmentId: string } | { success: false; error: string };

/** Admin (or super-admin) only: assign a judge to review a registration. */
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
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Already assigned to this judge." };
    }
    return { success: false, error: "Could not assign judge." };
  }
  await logAuditEvent(supabase, "judge.assigned", {
    targetType: "registration",
    targetId: registrationId,
    metadata: { judgeId },
  });
  return { success: true, assignmentId: data.id };
}

/** Admin (or super-admin) only: remove a judge assignment. */
export async function unassignJudge(assignmentId: string): Promise<StatusResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can unassign judges." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("registration_assignments").delete().eq("id", assignmentId);
  if (error) {
    return { success: false, error: "Could not remove assignment." };
  }
  await logAuditEvent(supabase, "judge.unassigned", {
    targetType: "registration_assignment",
    targetId: assignmentId,
  });
  return { success: true };
}

type DeckUrlResult = { success: true; url: string } | { success: false; error: string };

/**
 * Staff-only: a short-lived signed URL to view/download an uploaded deck.
 * The registration-decks bucket has no direct read policy for anyone —
 * this is the only path in, and it re-checks staff status itself rather
 * than trusting the caller, since it uses the service-role client
 * (bypasses RLS) to actually mint the URL.
 */
export async function getDeckDownloadUrl(deckPath: string): Promise<DeckUrlResult> {
  const caller = await getCallerRole();
  if (!caller || !["admin", "judge", "volunteer", "super_admin"].includes(caller.role)) {
    return { success: false, error: "Please sign in as staff." };
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

type StatusResult = { success: true } | { success: false; error: string };

/** Admin (or super-admin) only: change a registration's review status. */
export async function updateRegistrationStatus(
  registrationId: string,
  status: string,
): Promise<StatusResult> {
  if (!REGISTRATION_STATUSES.includes(status as (typeof REGISTRATION_STATUSES)[number])) {
    return { success: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Please sign in." };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isAdminLevelRole(profile.role)) {
    return { success: false, error: "Only admins can change registration status." };
  }

  // RLS's registrations_update_admin policy enforces is_admin() again at the
  // DB level regardless — the check above is just for a clean error message.
  const { error } = await supabase.from("registrations").update({ status }).eq("id", registrationId);
  if (error) {
    return { success: false, error: "Could not update status." };
  }
  await logAuditEvent(supabase, "registration.status_changed", {
    targetType: "registration",
    targetId: registrationId,
    metadata: { status },
  });
  return { success: true };
}

type CsvResult = { success: true; csv: string; filename: string } | { success: false; error: string };

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Admin (or super-admin) only: build a CSV of all registrations for offline
 * use (badges, contact lists). Includes leader emails/phones, so — unlike
 * the plain team reads above, which RLS's is_staff() happily allows for
 * judges too — this one gates on role explicitly. Judges shouldn't be able
 * to pull every team's contact info in one shot; it's the same bias/privacy
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

  const header = [
    "Team Name",
    "Theme",
    "District",
    "Leader Name",
    "Leader Email",
    "Leader Phone",
    "Leader College",
    "All Members",
    "Status",
    "Submitted At",
  ];

  const rows = result.teams.map((team) => {
    const leader = team.members.find((m) => m.is_leader);
    const allMembers = team.members.map((m) => m.full_name).join("; ");
    return [
      team.name,
      team.ai_theme,
      team.district,
      leader?.full_name ?? "",
      leader?.email ?? "",
      leader?.phone ?? "",
      leader?.college ?? "",
      allMembers,
      team.registration?.status ?? "",
      team.registration?.created_at ?? "",
    ].map(csvField);
  });

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  await logAuditEvent(supabase, "registrations.exported", { metadata: { teamCount: result.teams.length } });

  return { success: true, csv, filename: `registrations-${today}.csv` };
}

export type StaffAccount = { id: string; full_name: string; email: string; role: string; created_at: string };

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
  return { success: true, staff: data ?? [] };
}

const STAFF_ROLES = ["admin", "judge", "volunteer"] as const;
const STAFF_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

type CreateStaffResult = { success: true } | { success: false; error: string };

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
  password: string;
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
  if (input.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    if (error?.code === "email_exists") {
      return { success: false, error: "An account with that email already exists." };
    }
    return { success: false, error: "Could not create the account." };
  }

  // handle_new_user() already inserted a profiles row (default role 'admin')
  // — set it to the role actually requested.
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: input.role, full_name: fullName })
    .eq("id", data.user.id);

  if (roleError) {
    return {
      success: false,
      error: "Account created, but couldn't set its role. Fix it via scripts/seed-staff.mjs.",
    };
  }

  // Logged via the caller's own session client (not the service-role
  // client above) so log_audit_event()'s auth.uid() resolves to the
  // super-admin who did this, not an anonymous service-role call.
  const supabase = await createClient();
  await logAuditEvent(supabase, "staff.created", {
    targetType: "profile",
    targetId: data.user.id,
    targetLabel: email,
    metadata: { role: input.role },
  });

  return { success: true };
}
