"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns the caller's profile role, or null if not signed in / no profile. */
async function getCallerRole(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return null;

  return { userId: user.id, role: profile.role };
}

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

export type AdminRegistration = {
  id: string;
  problem_statement: string;
  proposed_solution: string;
  ai_approach: string;
  expected_impact: string;
  supporting_link: string | null;
  deck_path: string | null;
  status: "submitted" | "under_review" | "shortlisted" | "rejected";
  created_at: string;
  assignments: AdminAssignment[];
};

export type AdminTeam = {
  id: string;
  name: string;
  ai_theme: string;
  district: string;
  status: string;
  created_at: string;
  members: AdminMember[];
  registration: AdminRegistration | null;
};

const REGISTRATION_STATUSES = ["submitted", "under_review", "shortlisted", "rejected"] as const;

/** Staff-only data fetch: all teams with their members and registration. */
export async function getTeamsForAdmin(): Promise<
  { success: true; teams: AdminTeam[] } | { success: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(
      `id, name, ai_theme, district, status, created_at,
       team_members ( id, full_name, email, phone, college, branch, year, role_in_team, is_leader ),
       registrations (
         id, problem_statement, proposed_solution, ai_approach, expected_impact,
         supporting_link, deck_path, status, created_at,
         registration_assignments ( id, judge_id, profiles!registration_assignments_judge_id_fkey ( full_name ) )
       )`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    // RLS denies this entirely for non-staff — that shows up here as an
    // empty result or a permissions error depending on the query shape,
    // not a thrown exception, so this mostly catches genuine DB issues.
    return { success: false, error: "Could not load teams." };
  }

  const teams: AdminTeam[] = (data ?? []).map((t) => {
    const rawReg = Array.isArray(t.registrations) ? t.registrations[0] : t.registrations;
    let registration: AdminRegistration | null = null;
    if (rawReg) {
      const reg = rawReg as unknown as AdminRegistration & {
        registration_assignments: Array<{ id: string; judge_id: string; profiles: { full_name: string } | null }>;
      };
      registration = {
        ...reg,
        assignments: (reg.registration_assignments ?? []).map((a) => ({
          id: a.id,
          judge_id: a.judge_id,
          judge_name: a.profiles?.full_name ?? "Unknown",
        })),
      };
    }
    return {
      id: t.id,
      name: t.name,
      ai_theme: t.ai_theme,
      district: t.district,
      status: t.status,
      created_at: t.created_at,
      members: (t.team_members ?? []) as AdminMember[],
      registration,
    };
  });

  return { success: true, teams };
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
