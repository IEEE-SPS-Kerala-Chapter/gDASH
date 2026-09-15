"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";

export type AuditLogRange = "today" | "3" | "7" | "30" | "60" | "90" | "120" | "all";

export type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  actor_role: string;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the requested window, as a UTC instant — "today" is IST midnight, matching how dates are displayed elsewhere in this app. */
function rangeStart(range: AuditLogRange): string | null {
  if (range === "all") return null;
  const now = Date.now();
  if (range === "today") {
    const istNow = new Date(now + IST_OFFSET_MS);
    istNow.setUTCHours(0, 0, 0, 0);
    return new Date(istNow.getTime() - IST_OFFSET_MS).toISOString();
  }
  const days = Number(range);
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

const MAX_ROWS = 1000;

/** Super-admin only: recent activity across the whole platform. */
export async function getAuditLogs(
  range: AuditLogRange,
): Promise<{ success: true; logs: AuditLogEntry[] } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || caller.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can view the audit log." };
  }

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, actor_role, actor_label, action, target_type, target_id, target_label, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  const since = rangeStart(range);
  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Could not load the audit log." };
  }
  return { success: true, logs: (data ?? []) as AuditLogEntry[] };
}
