"use server";

import { createClient } from "@/lib/supabase/server";

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
       registrations ( id, problem_statement, proposed_solution, ai_approach, expected_impact, supporting_link, deck_path, status, created_at )`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    // RLS denies this entirely for non-staff — that shows up here as an
    // empty result or a permissions error depending on the query shape,
    // not a thrown exception, so this mostly catches genuine DB issues.
    return { success: false, error: "Could not load teams." };
  }

  const teams: AdminTeam[] = (data ?? []).map((t) => {
    const reg = Array.isArray(t.registrations) ? t.registrations[0] : t.registrations;
    return {
      id: t.id,
      name: t.name,
      ai_theme: t.ai_theme,
      district: t.district,
      status: t.status,
      created_at: t.created_at,
      members: (t.team_members ?? []) as AdminMember[],
      registration: (reg as AdminRegistration | null) ?? null,
    };
  });

  return { success: true, teams };
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
