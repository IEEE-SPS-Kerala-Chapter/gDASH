"use server";

import { revalidatePath } from "next/cache";
import { revalidateDashboard } from "@/lib/revalidate-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { logAuditEvent } from "@/lib/audit-log";
import { formatAmbassadorId, type AmbassadorDetails } from "@/lib/ambassador";
import { MAX_SHEET_ROWS } from "@/lib/ambassador-sheet";

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

/**
 * Name and college for each ID in the current range, for the registration
 * form's dropdown. Public. Empty on a read error — the IDs still work.
 */
export async function getAmbassadorDirectory(): Promise<AmbassadorDetails> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ambassador_directory");
    if (error || !data) return {};
    return toDetails(data as Array<{ number: number; name: string | null; college: string | null }>);
  } catch (err) {
    console.error("getAmbassadorDirectory threw unexpectedly:", err);
    return {};
  }
}

function toDetails(rows: Array<{ number: number; name: string | null; college: string | null }>): AmbassadorDetails {
  return Object.fromEntries(rows.map((r) => [r.number, { name: r.name, college: r.college }]));
}

export type AmbassadorRankingRow = {
  number: number;
  name: string | null;
  college: string | null;
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

/**
 * Super-admin only: set the name and college shown for one ambassador ID
 * (on the registration form too). Both empty clears them.
 */
export async function setAmbassadorDetails(number: number, details: { name: string; college: string }): Promise<Result> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can edit ambassadors." };
  }
  const name = details.name.trim();
  const college = details.college.trim();
  if (!Number.isInteger(number) || number < 0 || number > 999) {
    return { success: false, error: "Unknown ambassador ID." };
  }
  if (name.length > 80) {
    return { success: false, error: "Names can be at most 80 characters." };
  }
  if (college && (college.length < 2 || college.length > 120)) {
    return { success: false, error: "College names must be 2 to 120 characters." };
  }

  const supabase = await createClient();
  const { error } =
    name || college
      ? await supabase
          .from("ambassador_names")
          .upsert({ number, name: name || null, college: college || null, updated_at: new Date().toISOString() })
      : await supabase.from("ambassador_names").delete().eq("number", number);
  if (error) {
    return { success: false, error: "Could not save the details." };
  }

  await logAuditEvent(supabase, "ambassadors.details_updated", {
    targetLabel: formatAmbassadorId(number),
    metadata: { name: name || null, college: college || null },
  });
  revalidateDashboard();
  // The registration form lists them too.
  revalidatePath("/", "layout");
  return { success: true };
}

/** Super-admin only: every ambassador's name and college, by number — for the team page. */
export async function getAmbassadorDetails(): Promise<AmbassadorDetails> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") return {};
  const supabase = await createClient();
  const { data } = await supabase.from("ambassador_names").select("number, name, college");
  return toDetails(data ?? []);
}

/**
 * Super-admin only: save an uploaded ambassador sheet. Row order sets the
 * IDs (first row = AMGIG-00); IDs after the last row are left as they are,
 * and the range is raised to cover the sheet. All or nothing.
 */
export async function importAmbassadorSheet(
  rows: Array<{ name: string; college: string }>,
): Promise<{ success: true; imported: number; lastNumber: number } | { success: false; error: string }> {
  const caller = await getCallerRole();
  if (caller?.role !== "super_admin") {
    return { success: false, error: "Only the super-admin can import ambassadors." };
  }
  if (rows.length === 0 || rows.length > MAX_SHEET_ROWS) {
    return { success: false, error: `The sheet must have 1 to ${MAX_SHEET_ROWS} ambassadors.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_admin_import_ambassadors", {
    p_rows: rows.map((r) => ({ name: r.name.trim(), college: r.college.trim() })),
  });
  if (error || !data) {
    return {
      success: false,
      error:
        error?.hint === "bad_row"
          ? "Some rows have a missing or too-long name or college — fix them and upload again."
          : "Could not import the sheet. Nothing was changed.",
    };
  }
  const result = data as { imported: number; last_number: number };

  await logAuditEvent(supabase, "ambassadors.sheet_imported", {
    metadata: { imported: result.imported, range: `AMGIG-00 to ${formatAmbassadorId(result.last_number)}` },
  });
  revalidateDashboard();
  revalidatePath("/", "layout");
  return { success: true, imported: result.imported, lastNumber: result.last_number };
}
