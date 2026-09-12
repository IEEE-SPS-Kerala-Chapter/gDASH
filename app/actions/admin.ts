"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Admin-only: assign a judge to review a registration. */
export async function assignJudge(registrationId: string, judgeId: string): Promise<AssignResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (caller.role !== "admin") {
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
  return { success: true, assignmentId: data.id };
}

/** Admin-only: remove a judge assignment. */
export async function unassignJudge(assignmentId: string): Promise<StatusResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (caller.role !== "admin") {
    return { success: false, error: "Only admins can unassign judges." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("registration_assignments").delete().eq("id", assignmentId);
  if (error) {
    return { success: false, error: "Could not remove assignment." };
  }
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
  if (!caller || !["admin", "judge", "volunteer"].includes(caller.role)) {
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

type StatusResult = { success: true } | { success: false; error: string };

/** Admin-only: change a registration's review status. */
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
  if (profile?.role !== "admin") {
    return { success: false, error: "Only admins can change registration status." };
  }

  // RLS's registrations_update_admin policy enforces is_admin() again at the
  // DB level regardless — the check above is just for a clean error message.
  const { error } = await supabase.from("registrations").update({ status }).eq("id", registrationId);
  if (error) {
    return { success: false, error: "Could not update status." };
  }
  return { success: true };
}

type CsvResult = { success: true; csv: string; filename: string } | { success: false; error: string };

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Staff-only: build a CSV of all registrations for offline use (badges, contact lists). */
export async function exportRegistrationsCsv(): Promise<CsvResult> {
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

  return { success: true, csv, filename: `registrations-${today}.csv` };
}
