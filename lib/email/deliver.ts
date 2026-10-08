import { createAdminClient } from "@/lib/supabase/admin";
import { publicSiteUrl, sendEmail, type Email, type EmailAttachment } from "./send";
import { ineligibleEmail, registrationReceivedEmail, resultEmail } from "./templates";
import { renderIdCardPng } from "./id-card-image";

/**
 * Leader emails go through email_outbox
 * (supabase/migrations/20261010000000_email_outbox.sql): one row per team
 * and kind, claimed before sending so two callers can never send the same
 * email, and marked sent / failed afterwards. Uses the service-role client —
 * callers must have checked who's asking (or, for registration, run right
 * after the leader's own successful submit).
 */

export type EmailKind = "registration_received" | "ineligible" | "result";

type TeamForEmail = {
  id: string;
  name: string;
  entry_code: string;
  access_token: string;
  team_members: {
    id: string;
    member_code: string | null;
    full_name: string;
    email: string;
    is_leader: boolean;
    college: string;
    role_in_team: string | null;
    created_at: string;
  }[];
  registrations: { status: string }[] | { status: string } | null;
};

/** A row stuck in "sending" this long (the function died mid-send) can be claimed again. */
const STALE_SENDING_MS = 10 * 60 * 1000;

async function loadTeam(teamId: string): Promise<TeamForEmail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teams")
    .select(
      "id, name, entry_code, access_token, team_members(id, member_code, full_name, email, is_leader, college, role_in_team, created_at), registrations(status)",
    )
    .eq("id", teamId)
    .maybeSingle();
  if (error) throw new Error(`could not load team: ${error.message}`);
  return data as TeamForEmail | null;
}

function leaderOf(team: TeamForEmail) {
  return team.team_members.find((m) => m.is_leader) ?? null;
}

/**
 * Adds the email to the outbox unless this team already has one of this
 * kind (sent or not). Returns the row id when there's something to send.
 */
export async function queueEmail(teamId: string, kind: EmailKind): Promise<string | null> {
  const team = await loadTeam(teamId);
  const leader = team && leaderOf(team);
  if (!leader) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_outbox")
    .upsert({ team_id: teamId, kind, to_email: leader.email }, { onConflict: "team_id,kind", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not queue email: ${error.message}`);
  return data?.id ?? null;
}

/** Marks the row as being sent, if it's waiting (or stuck); false when someone else has it or it's done. */
async function claim(rowId: string): Promise<{ team_id: string; kind: EmailKind; to_email: string; attempts: number } | null> {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { data: row } = await admin
    .from("email_outbox")
    .select("team_id, kind, to_email, attempts, status, updated_at")
    .eq("id", rowId)
    .maybeSingle();
  if (!row) return null;
  const claimable = row.status === "pending" || (row.status === "sending" && row.updated_at < staleBefore);
  if (!claimable) return null;
  // Conditional on the status read above, so only one caller wins.
  const { data } = await admin
    .from("email_outbox")
    .update({ status: "sending", attempts: row.attempts + 1 })
    .eq("id", rowId)
    .eq("status", row.status)
    .eq("updated_at", row.updated_at)
    .select("team_id, kind, to_email, attempts")
    .maybeSingle();
  return data as { team_id: string; kind: EmailKind; to_email: string; attempts: number } | null;
}

async function buildEmail(kind: EmailKind, team: TeamForEmail, to: string): Promise<Email | null> {
  const site = publicSiteUrl();
  const leader = leaderOf(team);
  if (!leader) return null;
  const statusUrl = `${site}/register/status/${team.access_token}`;
  const leaderName = leader.full_name.split(" ")[0] || leader.full_name;

  if (kind === "registration_received") {
    // Leader first, then members in the order they were added.
    const members = [...team.team_members].sort(
      (a, b) => Number(b.is_leader) - Number(a.is_leader) || a.created_at.localeCompare(b.created_at),
    );
    const attachments: EmailAttachment[] = [];
    for (const m of members) {
      if (!m.member_code) continue;
      attachments.push({
        filename: `gignite-id-${m.member_code}.png`,
        content: await renderIdCardPng(team.name, { ...m, member_code: m.member_code }, site),
        contentType: "image/png",
      });
    }
    return {
      ...registrationReceivedEmail({
        site,
        to,
        leaderName,
        teamName: team.name,
        entryCode: team.entry_code,
        statusUrl,
        members: members.map((m) => ({ name: m.full_name, code: m.member_code ?? "", isLeader: m.is_leader })),
      }),
      attachments,
    };
  }

  if (kind === "ineligible") {
    return ineligibleEmail({ site, to, leaderName, teamName: team.name, statusUrl });
  }

  // Results: only for a decided team, and only while results are published.
  const reg = Array.isArray(team.registrations) ? team.registrations[0] : team.registrations;
  const outcome = reg?.status === "shortlisted" ? "shortlisted" : reg?.status === "rejected" ? "not_selected" : null;
  if (!outcome) return null;
  const admin = createAdminClient();
  const { data: pub } = await admin
    .from("results_publication")
    .select("is_published, shortlisted_message, not_selected_message")
    .eq("id", true)
    .single();
  if (!pub?.is_published) return null;
  return resultEmail({
    site,
    to,
    leaderName,
    teamName: team.name,
    statusUrl,
    outcome,
    message: (outcome === "shortlisted" ? pub.shortlisted_message : pub.not_selected_message) || null,
  });
}

/**
 * Sends one outbox row. Never throws: the outcome is recorded on the row.
 * Returns what happened, for batch progress.
 */
export async function deliver(rowId: string): Promise<"sent" | "failed" | "skipped"> {
  const admin = createAdminClient();
  const row = await claim(rowId).catch(() => null);
  if (!row) return "skipped";
  try {
    const team = await loadTeam(row.team_id);
    const email = team && (await buildEmail(row.kind, team, row.to_email));
    if (!email) {
      // Nothing to send any more (e.g. the team's result was changed back
      // to undecided after it was queued). Drop the row; "Send result
      // emails" queues it again once the team has a decision.
      await admin.from("email_outbox").delete().eq("id", rowId);
      return "skipped";
    }
    await sendEmail(email);
    await admin
      .from("email_outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", rowId);
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${row.kind} for team ${row.team_id} failed:`, message);
    await admin
      .from("email_outbox")
      .update({ status: "failed", last_error: message.slice(0, 500) })
      .eq("id", rowId);
    return "failed";
  }
}

/** Queue + send in one go — for the registration and ineligible emails. Never throws. */
export async function queueAndDeliver(teamId: string, kind: EmailKind): Promise<void> {
  try {
    const rowId = await queueEmail(teamId, kind);
    if (rowId) await deliver(rowId);
  } catch (err) {
    console.error(`[email] could not queue ${kind} for team ${teamId}:`, err);
  }
}

/**
 * The "couldn't confirm your eligibility" email, by registration id (what
 * the verification screens have). Once per team, even if it's marked
 * ineligible again later.
 */
export async function notifyIneligible(registrationId: string): Promise<void> {
  const { data } = await createAdminClient()
    .from("registrations")
    .select("team_id, verification_status")
    .eq("id", registrationId)
    .maybeSingle();
  if (data?.verification_status === "ineligible") await queueAndDeliver(data.team_id, "ineligible");
}
