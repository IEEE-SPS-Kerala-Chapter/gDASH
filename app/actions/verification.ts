"use server";

import { after } from "next/server";
import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { notifyIneligible } from "@/lib/email/deliver";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCallerRole } from "./admin";
import { logAuditEvent } from "@/lib/audit-log";
import type { VerificationStatus } from "@/lib/admin-teams";

/**
 * Team verification for volunteers (and admins): team, member and ID-card
 * details plus the verification fields — never the idea, deck, AI theme,
 * judges, scores or decisions. Everything goes through the SECURITY DEFINER
 * functions in supabase/migrations/20260928010000_volunteer_verification.sql,
 * which check the caller's role again; volunteers have no table access.
 */

const VERIFIER_ROLES = ["volunteer", "admin", "super_admin"];

async function callerCanVerify(): Promise<boolean> {
  const caller = await getCallerRole();
  return Boolean(caller && VERIFIER_ROLES.includes(caller.role));
}

export type VerificationTeamSummary = {
  teamId: string;
  name: string;
  entryCode: string;
  district: string;
  college: string | null;
  memberCount: number;
  memberNames: string;
  createdAt: string;
  registrationId: string;
  verificationStatus: VerificationStatus;
  verificationDecidedAt: string | null;
};

export type VerificationMember = {
  id: string;
  memberNo: number;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string;
  college: string;
  branch: string | null;
  year: string | null;
  roleInTeam: string | null;
  isLeader: boolean;
  hasIdCard: boolean;
};

/** The verification fields the panel shows and changes, plus the version they're checked against. */
export type VerificationState = {
  version: number;
  verification: {
    status: VerificationStatus;
    note: string | null;
    decidedAt: string | null;
    decidedByName: string | null;
  };
};

export type VerificationTeamDetail = {
  team: { id: string; name: string; entryCode: string; district: string; createdAt: string };
  members: VerificationMember[];
  registrationId: string;
  assignedJudgeCount: number;
  state: VerificationState;
};

type RawState = {
  version: number;
  verification_status: VerificationStatus;
  verification_note: string | null;
  verification_decided_at: string | null;
  verification_decided_by_name: string | null;
};

function toState(raw: RawState): VerificationState {
  return {
    version: raw.version,
    verification: {
      status: raw.verification_status,
      note: raw.verification_note,
      decidedAt: raw.verification_decided_at,
      decidedByName: raw.verification_decided_by_name,
    },
  };
}

function toSummary(t: Record<string, unknown>): VerificationTeamSummary {
  return {
    teamId: t.team_id as string,
    name: t.name as string,
    entryCode: t.entry_code as string,
    district: t.district as string,
    college: (t.college as string | null) ?? null,
    memberCount: Number(t.member_count ?? 0),
    memberNames: (t.member_names as string | null) ?? "",
    createdAt: t.created_at as string,
    registrationId: t.registration_id as string,
    verificationStatus: t.verification_status as VerificationStatus,
    verificationDecidedAt: (t.verification_decided_at as string | null) ?? null,
  };
}

export type VerificationCounts = { pending: number; verified: number; ineligible: number };

/**
 * One page of the verification list, with search and filters run in the
 * database (verification_team_page), plus the total matching and the
 * pending / verified / ineligible counts across all teams. The volunteer
 * screen loads more as it scrolls.
 */
export async function getVerificationTeamPage(query: {
  search?: string;
  verification?: string | null;
  district?: string | null;
  offset?: number;
  limit?: number;
}): Promise<
  | { success: true; teams: VerificationTeamSummary[]; total: number; counts: VerificationCounts }
  | { success: false; error: string }
> {
  if (!(await callerCanVerify())) {
    return { success: false, error: "Only volunteers and admins can verify teams." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verification_team_page", {
    p_search: query.search?.trim() || null,
    p_verification: query.verification || null,
    p_district: query.district || null,
    p_offset: Math.max(0, query.offset ?? 0),
    p_limit: Math.min(100, Math.max(1, query.limit ?? 30)),
  });
  if (error || !data) {
    return { success: false, error: "Could not load teams." };
  }
  const raw = data as { teams: Record<string, unknown>[]; total: number; counts: VerificationCounts };
  return { success: true, teams: (raw.teams ?? []).map(toSummary), total: raw.total, counts: raw.counts };
}

export async function getVerificationTeam(
  teamId: string,
): Promise<{ success: true; detail: VerificationTeamDetail } | { success: false; error: string }> {
  if (!(await callerCanVerify())) {
    return { success: false, error: "Only volunteers and admins can verify teams." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verification_get_team", { p_team_id: teamId });
  if (error || !data) {
    return { success: false, error: "Team not found." };
  }
  const raw = data as {
    team: { id: string; name: string; entry_code: string; district: string; created_at: string };
    members: Array<{
      id: string;
      member_no: number;
      member_code: string;
      full_name: string;
      email: string;
      phone: string;
      college: string;
      branch: string | null;
      year: string | null;
      role_in_team: string | null;
      is_leader: boolean;
      has_id_card: boolean;
    }>;
    registration: RawState & { id: string; assigned_judge_count: number };
  };
  return {
    success: true,
    detail: {
      team: {
        id: raw.team.id,
        name: raw.team.name,
        entryCode: raw.team.entry_code,
        district: raw.team.district,
        createdAt: raw.team.created_at,
      },
      members: raw.members.map((m) => ({
        id: m.id,
        memberNo: m.member_no,
        memberCode: m.member_code,
        fullName: m.full_name,
        email: m.email,
        phone: m.phone,
        college: m.college,
        branch: m.branch,
        year: m.year,
        roleInTeam: m.role_in_team,
        isLeader: m.is_leader,
        hasIdCard: m.has_id_card,
      })),
      registrationId: raw.registration.id,
      assignedJudgeCount: Number(raw.registration.assigned_judge_count ?? 0),
      state: toState(raw.registration),
    },
  };
}

const GUARD_MESSAGES: Record<string, string> = {
  has_assignments: "Judges are already assigned to this team — ask an admin to unassign them before changing its verification.",
  reason_required: "Give a reason for marking this team ineligible.",
  note_too_long: "Keep the note under 1000 characters.",
  invalid_status: "Invalid verification status.",
};

export type VerificationSaveResult =
  | { success: true; state: VerificationState }
  | { success: false; error: string; state?: VerificationState };

export async function setTeamVerification(
  registrationId: string,
  status: VerificationStatus,
  expectedVersion: number,
  note?: string,
): Promise<VerificationSaveResult> {
  const caller = await getCallerRole();
  if (!caller || !VERIFIER_ROLES.includes(caller.role)) {
    return { success: false, error: "Only volunteers and admins can verify teams." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_verification_status", {
    p_registration_id: registrationId,
    p_status: status,
    p_note: note ?? null,
    p_expected_version: expectedVersion,
  });
  if (error) {
    return { success: false, error: (error.hint && GUARD_MESSAGES[error.hint]) || "Could not save the change." };
  }
  if (!data) {
    return { success: false, error: "Registration not found." };
  }

  const result = data as { conflict: boolean; state: RawState };
  const state = toState(result.state);
  if (result.conflict) {
    const by = state.verification.decidedByName ? ` by ${state.verification.decidedByName}` : "";
    return {
      success: false,
      error: `Someone else updated this team's verification${by} while you were viewing it. Showing the latest — check it and try again if still needed.`,
      state,
    };
  }

  await logAuditEvent(supabase, "registration.verification_changed", {
    targetType: "registration",
    targetId: registrationId,
    metadata: { verificationStatus: status, ...(status === "ineligible" && note ? { note: note.trim() } : {}) },
  });
  revalidateDashboard();
  if (status === "ineligible") after(() => notifyIneligible(registrationId));
  return { success: true, state };
}

/**
 * A 5-minute signed link to one member's ID card. Keyed by member id (the
 * path comes from verification_id_card_path, which re-checks the role), so
 * a caller can't get arbitrary storage paths signed.
 */
export async function getVerificationIdCardUrl(
  memberId: string,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  if (!(await callerCanVerify())) {
    return { success: false, error: "Only volunteers and admins can view ID cards." };
  }
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("verification_id_card_path", { p_member_id: memberId });
  if (error || typeof path !== "string" || !path) {
    return { success: false, error: "No ID card uploaded." };
  }
  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage.from("member-id-cards").createSignedUrl(path, 60 * 5);
  if (signError || !data) {
    return { success: false, error: "Could not load the ID card." };
  }
  return { success: true, url: data.signedUrl };
}
