"use server";

import { revalidateDashboard } from "@/lib/revalidate-dashboard";

import { createClient } from "@/lib/supabase/server";
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
