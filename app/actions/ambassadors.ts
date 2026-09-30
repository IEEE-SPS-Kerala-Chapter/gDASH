"use server";

import { revalidatePath } from "next/cache";
import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { logAuditEvent } from "@/lib/audit-log";
import { formatAmbassadorId } from "@/lib/ambassador";

/**
 * The last ambassador number (IDs run AMGIG-00 … AMGIG-<n>), or null when
 * no IDs have been set up yet. Public — the registration form needs it.
 * Returns null on a read error, which hides the field rather than blocking
 * registration.
 */
export async function getAmbassadorRange(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ambassador_program").select("last_number").eq("id", true).single();
    if (error || !data) return null;
    return data.last_number;
  } catch (err) {
    console.error("getAmbassadorRange threw unexpectedly:", err);
    return null;
  }
}

export type AmbassadorRankingRow = {
  number: number;
  name: string | null;
  total: number;
  shortlisted: number;
  /** null while the ambassador has no referrals yet. */
  rank: number | null;
};

export type AmbassadorRanking = {
  lastNumber: number | null;
  rows: AmbassadorRankingRow[];
  referred: number;
  noAmbassador: number;
};

/** Super-admin only: every ID in the range with its referral counts, best first. */
export async function getAmbassadorRanking(): Promise<{ success: true; ranking: AmbassadorRanking } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can view ambassadors." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ambassador_ranking");
  if (error || !data) {
    return { success: false, error: "Could not load the ambassador ranking." };
  }
  const raw = data as { last_number: number | null; rows: AmbassadorRankingRow[]; referred: number; no_ambassador: number };
  return {
    success: true,
    ranking: { lastNumber: raw.last_number, rows: raw.rows, referred: raw.referred, noAmbassador: raw.no_ambassador },
  };
}

type Result = { success: true } | { success: false; error: string };

/** Super-admin only: set the last ambassador ID (the range always starts at AMGIG-00). */
export async function setAmbassadorRange(lastNumber: number): Promise<Result> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can change the ambassador IDs." };
  }
  if (!Number.isInteger(lastNumber) || lastNumber < 0 || lastNumber > 999) {
    return { success: false, error: "Enter a number from 0 to 999." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ambassador_program")
    .update({ last_number: lastNumber })
    .eq("id", true)
    .select("last_number")
    .maybeSingle();
  if (error) {
    const [kind, highest] = (error.hint ?? "").split(":");
    if (kind === "range_in_use") {
      return {
        success: false,
        error: `${formatAmbassadorId(Number(highest))} is already used by a registration, so the range can't end before it.`,
      };
    }
    return { success: false, error: "Could not save the ambassador IDs." };
  }
  if (!data) {
    return { success: false, error: "Could not save the ambassador IDs." };
  }

  await logAuditEvent(supabase, "ambassadors.range_updated", {
    metadata: { range: `AMGIG-00 to ${formatAmbassadorId(lastNumber)}` },
  });
  revalidateDashboard();
  // The registration form reads the range too.
  revalidatePath("/", "layout");
  return { success: true };
}

/** Super-admin only: set or clear (empty name) the staff-only name for one ambassador ID. */
export async function setAmbassadorName(number: number, name: string): Promise<Result> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can name ambassadors." };
  }
  const trimmed = name.trim();
  if (!Number.isInteger(number) || number < 0 || number > 999) {
    return { success: false, error: "Unknown ambassador ID." };
  }
  if (trimmed.length > 80) {
    return { success: false, error: "Names can be at most 80 characters." };
  }

  const supabase = await createClient();
  const { error } = trimmed
    ? await supabase.from("ambassador_names").upsert({ number, name: trimmed, updated_at: new Date().toISOString() })
    : await supabase.from("ambassador_names").delete().eq("number", number);
  if (error) {
    return { success: false, error: "Could not save the name." };
  }

  await logAuditEvent(supabase, "ambassadors.name_updated", {
    targetLabel: formatAmbassadorId(number),
    metadata: { name: trimmed || null },
  });
  revalidateDashboard();
  return { success: true };
}

/** Super-admin only: every staff-only name, by number — for the team page. */
export async function getAmbassadorNames(): Promise<Record<number, string>> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") return {};
  const supabase = await createClient();
  const { data } = await supabase.from("ambassador_names").select("number, name");
  return Object.fromEntries((data ?? []).map((r) => [r.number, r.name]));
}
