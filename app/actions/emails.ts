"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import { deliver, queueEmail, type EmailKind } from "@/lib/email/deliver";

export type TeamEmail = {
  kind: EmailKind;
  toEmail: string;
  status: "pending" | "sending" | "sent" | "failed";
  sentAt: string | null;
  lastError: string | null;
};

const ADMIN_ONLY = "Only admins can see or resend team emails.";

/** Admin only: the emails this team's leader has been sent (or should have been). */
export async function getTeamEmails(teamId: string): Promise<{ success: true; emails: TeamEmail[] } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return { success: false, error: ADMIN_ONLY };
  const { data, error } = await createAdminClient()
    .from("email_outbox")
    .select("kind, to_email, status, sent_at, last_error")
    .eq("team_id", teamId)
    .order("created_at");
  if (error) return { success: false, error: "Could not load the emails." };
  return {
    success: true,
    emails: data.map((r) => ({
      kind: r.kind,
      toEmail: r.to_email,
      status: r.status,
      sentAt: r.sent_at,
      lastError: r.last_error,
    })),
  };
}

/**
 * Admin only: send one of the team's emails again (e.g. it failed, or the
 * leader lost it). Goes to the leader's current email address.
 */
export async function resendTeamEmail(
  teamId: string,
  kind: EmailKind,
): Promise<{ success: true; status: "sent" | "failed" | "skipped" } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return { success: false, error: ADMIN_ONLY };

  const admin = createAdminClient();
  const { data: leader } = await admin
    .from("team_members")
    .select("email")
    .eq("team_id", teamId)
    .eq("is_leader", true)
    .maybeSingle();
  if (!leader) return { success: false, error: "This team has no leader to email." };

  // Reset an existing row (any status but mid-send), or queue a new one.
  const { data: existing } = await admin
    .from("email_outbox")
    .update({ status: "pending", to_email: leader.email, last_error: null })
    .eq("team_id", teamId)
    .eq("kind", kind)
    .neq("status", "sending")
    .select("id")
    .maybeSingle();
  const rowId = existing?.id ?? (await queueEmail(teamId, kind).catch(() => null));
  if (!rowId) return { success: false, error: "That email is being sent right now — check again in a minute." };

  const status = await deliver(rowId);
  if (status === "skipped") {
    return { success: false, error: kind === "result" ? "This team has no published result to email." : "Nothing to send." };
  }
  const supabase = await createClient();
  await logAuditEvent(supabase, "team.email_resent", {
    targetType: "team",
    targetId: teamId,
    metadata: { kind, status },
  });
  return { success: true, status };
}
