"use server";

import { revalidateDashboard } from "@/lib/revalidate-dashboard";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliver } from "@/lib/email/deliver";
import { getCallerRole } from "./admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";

export type ResultsPublication = {
  isPublished: boolean;
  publishedAt: string | null;
  shortlistedMessage: string;
  notSelectedMessage: string;
  counts: { shortlisted: number; notSelected: number; undecided: number };
};

type LoadResult = { success: true; data: ResultsPublication } | { success: false; error: string };
type ActionResult = { success: true } | { success: false; error: string };

const MAX_MESSAGE_LENGTH = 2000;
const ADMIN_ONLY_ERROR = "Only admins can manage results.";

/**
 * Admin and super-admin only (results_publication's RLS enforces is_admin()
 * again). The results reveal itself — status page and ID-card QR page —
 * reads through get_registration_by_token / get_member_result, which hide
 * decisions until this switch is on
 * (supabase/migrations/20260928000000_results_publication.sql).
 */
export async function getResultsPublication(): Promise<LoadResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const supabase = await createClient();
  const [{ data: row, error }, { data: regs, error: regsError }] = await Promise.all([
    supabase
      .from("results_publication")
      .select("is_published, published_at, shortlisted_message, not_selected_message")
      .eq("id", true)
      .single(),
    supabase.from("registrations").select("status"),
  ]);
  if (error || !row || regsError || !regs) {
    return { success: false, error: "Could not load the results settings." };
  }

  const counts = { shortlisted: 0, notSelected: 0, undecided: 0 };
  for (const r of regs) {
    if (r.status === "shortlisted") counts.shortlisted += 1;
    else if (r.status === "rejected") counts.notSelected += 1;
    else counts.undecided += 1;
  }

  return {
    success: true,
    data: {
      isPublished: row.is_published,
      publishedAt: row.published_at,
      shortlistedMessage: row.shortlisted_message ?? "",
      notSelectedMessage: row.not_selected_message ?? "",
      counts,
    },
  };
}

export async function updateResultsMessages(input: {
  shortlistedMessage: string;
  notSelectedMessage: string;
}): Promise<ActionResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }
  const shortlisted = input.shortlistedMessage.trim();
  const notSelected = input.notSelectedMessage.trim();
  if (shortlisted.length > MAX_MESSAGE_LENGTH || notSelected.length > MAX_MESSAGE_LENGTH) {
    return { success: false, error: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("results_publication")
    .update({ shortlisted_message: shortlisted || null, not_selected_message: notSelected || null })
    .eq("id", true);
  if (error) {
    return { success: false, error: "Could not save the messages." };
  }
  await logAuditEvent(supabase, "results.messages_updated");
  revalidateDashboard();
  return { success: true };
}

export async function setResultsPublished(publish: boolean): Promise<ActionResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("results_publication")
    .update(
      publish
        ? { is_published: true, published_at: new Date().toISOString(), published_by: caller.userId }
        : { is_published: false },
    )
    .eq("id", true);
  if (error) {
    return { success: false, error: publish ? "Could not publish the results." : "Could not un-publish the results." };
  }

  const current = await getResultsPublication();
  await logAuditEvent(supabase, publish ? "results.published" : "results.unpublished", {
    metadata: current.success ? current.data.counts : undefined,
  });
  revalidateDashboard();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Result emails — sent to each decided team's leader when an admin clicks
// "Send result emails" (after publishing), in small batches the Results
// panel keeps requesting until none are left. See lib/email/deliver.ts.
// ---------------------------------------------------------------------------

export type ResultEmailProgress = { total: number; sent: number; pending: number; failed: number };
type ProgressResult = { success: true; progress: ResultEmailProgress } | { success: false; error: string };

/** Emails per batch request — small enough to finish well inside a function's time limit. */
const RESULT_EMAIL_BATCH = 10;

async function resultEmailProgress(): Promise<ResultEmailProgress> {
  const { data, error } = await createAdminClient().from("email_outbox").select("status").eq("kind", "result");
  if (error) throw new Error(error.message);
  const progress = { total: data.length, sent: 0, pending: 0, failed: 0 };
  for (const r of data) {
    if (r.status === "sent") progress.sent += 1;
    else if (r.status === "failed") progress.failed += 1;
    else progress.pending += 1;
  }
  return progress;
}

export async function getResultEmailProgress(): Promise<ProgressResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return { success: false, error: ADMIN_ONLY_ERROR };
  try {
    return { success: true, progress: await resultEmailProgress() };
  } catch {
    return { success: false, error: "Could not load the email progress." };
  }
}

/**
 * Queues a result email for every shortlisted / not-selected team that
 * doesn't have one yet (so clicking again, or after un-publishing and
 * re-publishing, never emails a team twice), and puts failed ones back in
 * the queue. Only while results are published.
 */
export async function startResultEmails(): Promise<ProgressResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return { success: false, error: ADMIN_ONLY_ERROR };

  const admin = createAdminClient();
  const { data: pub } = await admin.from("results_publication").select("is_published").eq("id", true).single();
  if (!pub?.is_published) {
    return { success: false, error: "Publish the results first — emails only go out for published results." };
  }

  const { data: teams, error } = await admin
    .from("registrations")
    .select("team_id, teams!inner(team_members(email, is_leader))")
    .in("status", ["shortlisted", "rejected"]);
  if (error || !teams) return { success: false, error: "Could not load the decided teams." };

  const rows = teams.flatMap((t) => {
    const members = (t.teams as unknown as { team_members: { email: string; is_leader: boolean }[] }).team_members;
    const leader = members.find((m) => m.is_leader);
    return leader ? [{ team_id: t.team_id, kind: "result", to_email: leader.email }] : [];
  });
  if (rows.length > 0) {
    const { error: queueError } = await admin
      .from("email_outbox")
      .upsert(rows, { onConflict: "team_id,kind", ignoreDuplicates: true });
    if (queueError) return { success: false, error: "Could not queue the emails." };
  }
  await admin.from("email_outbox").update({ status: "pending" }).eq("kind", "result").eq("status", "failed");

  const supabase = await createClient();
  await logAuditEvent(supabase, "results.emails_started", { metadata: { teams: rows.length } });
  return getResultEmailProgress();
}

/** Sends the next few queued result emails and returns the progress so far. */
export async function sendNextResultEmails(): Promise<ProgressResult> {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) return { success: false, error: ADMIN_ONLY_ERROR };

  const admin = createAdminClient();
  const { data: pub } = await admin.from("results_publication").select("is_published").eq("id", true).single();
  if (!pub?.is_published) {
    return { success: false, error: "Results were un-published, so sending stopped." };
  }

  const { data: batch, error } = await admin
    .from("email_outbox")
    .select("id")
    .eq("kind", "result")
    // Waiting, or stuck mid-send for 10+ minutes (the sender died).
    .or(`status.eq.pending,and(status.eq.sending,updated_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()})`)
    .order("created_at")
    .limit(RESULT_EMAIL_BATCH);
  if (error) return { success: false, error: "Could not load the queue." };
  for (const row of batch ?? []) {
    await deliver(row.id);
  }
  return getResultEmailProgress();
}
