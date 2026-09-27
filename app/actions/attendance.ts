"use server";

import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { csvField } from "@/lib/csv";
import type { CheckpointKind } from "./checkin";

/**
 * Attendance (venue check-in and meals) for shortlisted teams — see
 * supabase/migrations/20260930000000_attendance.sql. Volunteers get the
 * counts only (getAttendanceSummary); the per-person view, corrections and
 * export are admin/super-admin only.
 */

const SCANNER_ROLES = ["volunteer", "admin", "super_admin"];

export type AttendanceSummaryItem = {
  id: string;
  kind: CheckpointKind;
  label: string;
  isOpen: boolean;
  scanned: number;
  eligible: number;
};

export async function getAttendanceSummary(): Promise<
  { success: true; items: AttendanceSummaryItem[] } | { success: false; error: string }
> {
  const caller = await getCallerRole();
  if (!caller || !SCANNER_ROLES.includes(caller.role)) {
    return { success: false, error: "Only volunteers and admins can see attendance." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_summary");
  if (error || !Array.isArray(data)) {
    return { success: false, error: "Could not load attendance." };
  }
  return {
    success: true,
    items: (data as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      kind: c.kind as CheckpointKind,
      label: c.label as string,
      isOpen: Boolean(c.is_open),
      scanned: Number(c.scanned ?? 0),
      eligible: Number(c.eligible ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// Admin: per-person attendance
// ---------------------------------------------------------------------------

export type AttendanceScan = { at: string; byName: string | null };

export type AttendanceMember = {
  id: string;
  memberNo: number;
  memberCode: string;
  fullName: string;
  isLeader: boolean;
  college: string;
  scans: Record<string, AttendanceScan>;
};

export type AttendanceTeam = { id: string; name: string; entryCode: string; members: AttendanceMember[] };

export type AttendanceData = {
  checkpoints: { id: string; kind: CheckpointKind; label: string; isOpen: boolean }[];
  teams: AttendanceTeam[];
};

async function requireAdmin() {
  const caller = await getCallerRole();
  return caller && isAdminLevelRole(caller.role) ? caller : null;
}

export async function getAttendance(): Promise<{ success: true; data: AttendanceData } | { success: false; error: string }> {
  if (!(await requireAdmin())) {
    return { success: false, error: "Only admins can see attendance details." };
  }
  const supabase = await createClient();
  const [checkpointsRes, teamsRes, scansRes] = await Promise.all([
    supabase.from("event_checkpoints").select("id, kind, label, is_open, sort_order, created_at"),
    supabase
      .from("teams")
      .select(
        "id, name, entry_code, registrations!inner ( status ), team_members ( id, member_no, member_code, full_name, is_leader, college )",
      )
      .eq("registrations.status", "shortlisted"),
    supabase
      .from("checkpoint_scans")
      .select("checkpoint_id, member_id, scanned_at, scanned_by:profiles!checkpoint_scans_scanned_by_fkey ( full_name )"),
  ]);
  if (checkpointsRes.error || teamsRes.error || scansRes.error) {
    return { success: false, error: "Could not load attendance." };
  }

  const checkpoints = (checkpointsRes.data ?? [])
    .sort((a, b) =>
      a.kind === b.kind
        ? a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
        : a.kind === "venue"
          ? -1
          : 1,
    )
    .map((c) => ({ id: c.id, kind: c.kind as CheckpointKind, label: c.label, isOpen: c.is_open }));

  const scansByMember = new Map<string, Record<string, AttendanceScan>>();
  for (const s of scansRes.data ?? []) {
    const by = s.scanned_by as unknown as { full_name: string } | null;
    const entry = scansByMember.get(s.member_id) ?? {};
    entry[s.checkpoint_id] = { at: s.scanned_at, byName: by?.full_name ?? null };
    scansByMember.set(s.member_id, entry);
  }

  type RawTeam = {
    id: string;
    name: string;
    entry_code: string;
    team_members: { id: string; member_no: number; member_code: string; full_name: string; is_leader: boolean; college: string }[];
  };
  const teams = ((teamsRes.data ?? []) as unknown as RawTeam[])
    .map((t) => ({
      id: t.id,
      name: t.name,
      entryCode: t.entry_code,
      members: [...t.team_members]
        .sort((a, b) => a.member_no - b.member_no)
        .map((m) => ({
          id: m.id,
          memberNo: m.member_no,
          memberCode: m.member_code,
          fullName: m.full_name,
          isLeader: m.is_leader,
          college: m.college,
          scans: scansByMember.get(m.id) ?? {},
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { success: true, data: { checkpoints, teams } };
}

const SET_SCAN_ERRORS: Record<string, string> = {
  not_eligible: "Only members of shortlisted teams can be marked.",
  no_checkpoint: "That check-in point no longer exists.",
};

export async function setScan(
  checkpointId: string,
  memberId: string,
  present: boolean,
): Promise<{ success: true; scan: AttendanceScan | null } | { success: false; error: string }> {
  if (!(await requireAdmin())) {
    return { success: false, error: "Only admins can change attendance." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_scan", {
    p_checkpoint_id: checkpointId,
    p_member_id: memberId,
    p_present: present,
  });
  if (error || !data) {
    return { success: false, error: (error?.hint && SET_SCAN_ERRORS[error.hint]) || "Could not save the change." };
  }
  const r = data as { present: boolean; scanned_at?: string; scanned_by_name?: string | null };
  await logAuditEvent(supabase, present ? "checkin.scan_marked" : "checkin.scan_removed", {
    targetType: "team_member",
    targetId: memberId,
    metadata: { checkpointId },
  });
  revalidateDashboard();
  return { success: true, scan: r.present && r.scanned_at ? { at: r.scanned_at, byName: r.scanned_by_name ?? null } : null };
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export async function exportAttendanceCsv(): Promise<
  { success: true; csv: string; filename: string } | { success: false; error: string }
> {
  const result = await getAttendance();
  if (!result.success) return result;
  const { checkpoints, teams } = result.data;

  const header = ["Team", "Entry code", "Member", "Member code", "Leader", "College", ...checkpoints.map((c) => c.label)].map(
    csvField,
  );
  const rows = teams.flatMap((t) =>
    t.members.map((m) =>
      [
        t.name,
        t.entryCode,
        m.fullName,
        m.memberCode,
        m.isLeader ? "Yes" : "No",
        m.college,
        ...checkpoints.map((c) => (m.scans[c.id] ? istTime(m.scans[c.id].at) : "")),
      ].map(csvField),
    ),
  );
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  await logAuditEvent(supabase, "attendance.exported", { metadata: { rows: rows.length } });
  return { success: true, csv, filename: `attendance-${today}.csv` };
}
