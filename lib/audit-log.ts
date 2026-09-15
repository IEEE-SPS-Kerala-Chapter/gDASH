import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records one row in audit_logs via the log_audit_event() RPC (see
 * supabase/migrations/20260916000000_super_admin_and_audit_log.sql).
 * Pass the caller's own session client (not the service-role client) so
 * the RPC's auth.uid() resolves to the actual actor — it runs SECURITY
 * DEFINER, so it can write to audit_logs regardless of who's calling.
 * Logging failures are swallowed (logged to the server console) rather
 * than surfaced to the user — an audit-log write should never be the
 * reason a real action appears to fail.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  action: string,
  opts?: {
    targetType?: string;
    targetId?: string | null;
    targetLabel?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("log_audit_event", {
    p_action: action,
    p_target_type: opts?.targetType ?? null,
    p_target_id: opts?.targetId ?? null,
    p_target_label: opts?.targetLabel ?? null,
    p_metadata: opts?.metadata ?? {},
  });
  if (error) {
    console.error(`audit log failed for "${action}":`, error.message);
  }
}
