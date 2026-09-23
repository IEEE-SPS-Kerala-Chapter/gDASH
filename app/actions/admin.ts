"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import {
  TEAM_SELECT,
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
    return { success: true, alreadyRemoved: true };
  }
  await logAuditEvent(supabase, "judge.unassigned", {
    targetType: "registration_assignment",
    targetId: assignmentId,
  });
  return { success: true, alreadyRemoved: false };
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
  }
  return result;
}

const VERIFICATION_STATUSES = ["pending", "verified", "ineligible"] as const;

/**
 * Admin (or super-admin) only: record the eligibility check for a
 * registration (ID cards / details checked → verified, or ineligible).
 * Only verified registrations can be assigned judges. A reason is required
 * for "ineligible" so there's a record of why. Who/when is stamped by the
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
  if (status === "ineligible" && !trimmedNote) {
    return { success: false, error: "Give a reason for marking this team ineligible." };
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
  }
  return result;
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
    "Verification",
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
      team.registration?.verification_status ?? "",
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

  return { success: true };
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

  return { success: true };
}
