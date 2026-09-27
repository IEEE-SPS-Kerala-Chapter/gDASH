"use server";

import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { parseMemberRef } from "@/lib/member-ref";

/**
 * Event-day scanning: venue check-in and meal tokens, for shortlisted
 * teams only (supabase/migrations/20260929000000_event_checkpoints.sql).
 * Scanners (volunteers, admins, super-admins) go through the scan_* RPCs,
 * which re-check the role; checkpoint setup is admin-only (RLS is_admin()).
 */

const SCANNER_ROLES = ["volunteer", "admin", "super_admin"];

export type CheckpointKind = "venue" | "meal";
export type OpenCheckpoint = { id: string; kind: CheckpointKind; label: string };

export type ScannedMember = {
  id: string;
  fullName: string;
  memberCode: string;
  isLeader: boolean;
  college: string;
  roleInTeam: string | null;
  teamName: string;
  entryCode: string;
  hasIdCard: boolean;
  venueCheckedIn: boolean;
};

export type ScanOutcome =
  | { result: "ok" | "already"; member: ScannedMember; scannedAt: string; scannedByName: string | null }
  | { result: "not_eligible"; member: ScannedMember }
  | { result: "not_found" | "checkpoint_closed" | "invalid_code" };

async function callerCanScan(): Promise<boolean> {
  const caller = await getCallerRole();
  return Boolean(caller && SCANNER_ROLES.includes(caller.role));
}

export async function getOpenCheckpoints(): Promise<
  { success: true; checkpoints: OpenCheckpoint[] } | { success: false; error: string }
> {
  if (!(await callerCanScan())) {
    return { success: false, error: "Only volunteers and admins can scan." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("scan_list_checkpoints");
  if (error || !Array.isArray(data)) {
    return { success: false, error: "Could not load check-in points." };
  }
  return { success: true, checkpoints: data as OpenCheckpoint[] };
}

type RawMember = {
  id: string;
  full_name: string;
  member_code: string;
  is_leader: boolean;
  college: string;
  role_in_team: string | null;
  team_name: string;
  entry_code: string;
  has_id_card: boolean;
  venue_checked_in: boolean;
};

function toMember(m: RawMember): ScannedMember {
  return {
    id: m.id,
    fullName: m.full_name,
    memberCode: m.member_code,
    isLeader: m.is_leader,
    college: m.college,
    roleInTeam: m.role_in_team,
    teamName: m.team_name,
    entryCode: m.entry_code,
    hasIdCard: m.has_id_card,
    venueCheckedIn: m.venue_checked_in,
  };
}

/** `raw` is whatever the camera read or the volunteer typed. */
export async function scanMember(
  checkpointId: string,
  raw: string,
): Promise<{ success: true; outcome: ScanOutcome } | { success: false; error: string }> {
  if (!(await callerCanScan())) {
    return { success: false, error: "Only volunteers and admins can scan." };
  }
  const ref = parseMemberRef(raw);
  if (!ref) {
    return { success: true, outcome: { result: "invalid_code" } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("scan_member", { p_checkpoint_id: checkpointId, p_member_ref: ref });
  if (error || !data) {
    return { success: false, error: "The scan couldn't be saved. Check the connection and try again." };
  }
  const r = data as { result: string; member?: RawMember; scanned_at?: string; scanned_by_name?: string | null };
  if ((r.result === "ok" || r.result === "already") && r.member && r.scanned_at) {
    return {
      success: true,
      outcome: { result: r.result, member: toMember(r.member), scannedAt: r.scanned_at, scannedByName: r.scanned_by_name ?? null },
    };
  }
  if (r.result === "not_eligible" && r.member) {
    return { success: true, outcome: { result: "not_eligible", member: toMember(r.member) } };
  }
  return { success: true, outcome: { result: r.result === "checkpoint_closed" ? "checkpoint_closed" : "not_found" } };
}

export async function undoScan(
  checkpointId: string,
  memberId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await callerCanScan())) {
    return { success: false, error: "Only volunteers and admins can scan." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_scan", { p_checkpoint_id: checkpointId, p_member_id: memberId });
  if (error) {
    return { success: false, error: "Couldn't undo the scan. Check the connection and try again." };
  }
  if (data !== true) {
    return { success: false, error: "This scan can no longer be undone (only within 2 minutes, or by an admin)." };
  }
  await logAuditEvent(supabase, "checkin.scan_undone", {
    targetType: "team_member",
    targetId: memberId,
    metadata: { checkpointId },
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin setup
// ---------------------------------------------------------------------------

export type Checkpoint = OpenCheckpoint & { isOpen: boolean; scanCount: number; createdAt: string };

type AdminResult = { success: true } | { success: false; error: string };

async function requireAdmin() {
  const caller = await getCallerRole();
  return caller && isAdminLevelRole(caller.role) ? caller : null;
}

export async function getCheckpoints(): Promise<
  { success: true; checkpoints: Checkpoint[] } | { success: false; error: string }
> {
  if (!(await requireAdmin())) {
    return { success: false, error: "Only admins can manage check-in." };
  }
  const supabase = await createClient();
  const [{ data: rows, error }, { data: scans, error: scansError }] = await Promise.all([
    supabase.from("event_checkpoints").select("id, kind, label, is_open, sort_order, created_at"),
    supabase.from("checkpoint_scans").select("checkpoint_id"),
  ]);
  if (error || !rows || scansError || !scans) {
    return { success: false, error: "Could not load check-in points." };
  }
  const counts = new Map<string, number>();
  for (const s of scans) counts.set(s.checkpoint_id, (counts.get(s.checkpoint_id) ?? 0) + 1);
  const checkpoints = rows
    .sort((a, b) =>
      a.kind === b.kind
        ? a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
        : a.kind === "venue"
          ? -1
          : 1,
    )
    .map((c) => ({
      id: c.id,
      kind: c.kind as CheckpointKind,
      label: c.label,
      isOpen: c.is_open,
      createdAt: c.created_at,
      scanCount: counts.get(c.id) ?? 0,
    }));
  return { success: true, checkpoints };
}

function cleanLabel(label: string): string | null {
  const value = label.trim().replace(/\s+/g, " ");
  return value.length >= 1 && value.length <= 60 ? value : null;
}

export async function createMealCheckpoint(label: string): Promise<AdminResult> {
  const caller = await requireAdmin();
  if (!caller) return { success: false, error: "Only admins can manage check-in." };
  const clean = cleanLabel(label);
  if (!clean) return { success: false, error: "Give the meal a name of up to 60 characters." };

  const supabase = await createClient();
  // New meals go to the end of the list.
  const { data: last } = await supabase
    .from("event_checkpoints")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("event_checkpoints")
    .insert({ kind: "meal", label: clean, sort_order: (last?.sort_order ?? 0) + 1, created_by: caller.userId });
  if (error) return { success: false, error: "Could not add the meal." };
  await logAuditEvent(supabase, "checkin.checkpoint_created", { metadata: { label: clean } });
  revalidateDashboard();
  return { success: true };
}

export async function renameCheckpoint(id: string, label: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return { success: false, error: "Only admins can manage check-in." };
  const clean = cleanLabel(label);
  if (!clean) return { success: false, error: "Names can be up to 60 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_checkpoints").update({ label: clean }).eq("id", id);
  if (error) return { success: false, error: "Could not rename it." };
  await logAuditEvent(supabase, "checkin.checkpoint_renamed", { targetId: id, metadata: { label: clean } });
  revalidateDashboard();
  return { success: true };
}

export async function setCheckpointOpen(id: string, open: boolean): Promise<AdminResult> {
  if (!(await requireAdmin())) return { success: false, error: "Only admins can manage check-in." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_checkpoints").update({ is_open: open }).eq("id", id);
  if (error) return { success: false, error: open ? "Could not open it." : "Could not close it." };
  await logAuditEvent(supabase, open ? "checkin.checkpoint_opened" : "checkin.checkpoint_closed", { targetId: id });
  revalidateDashboard();
  return { success: true };
}

export async function deleteCheckpoint(id: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return { success: false, error: "Only admins can manage check-in." };
  const supabase = await createClient();
  const { count } = await supabase
    .from("checkpoint_scans")
    .select("checkpoint_id", { count: "exact", head: true })
    .eq("checkpoint_id", id);
  if ((count ?? 0) > 0) {
    return { success: false, error: "This meal already has scans, so it can't be deleted. Close it instead." };
  }
  const { error } = await supabase.from("event_checkpoints").delete().eq("id", id).eq("kind", "meal");
  if (error) return { success: false, error: "Could not delete it." };
  await logAuditEvent(supabase, "checkin.checkpoint_deleted", { targetId: id });
  revalidateDashboard();
  return { success: true };
}
