"use server";

import { createClient } from "@/lib/supabase/server";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { verifyTurnstile } from "@/lib/turnstile";
import { GOOGLE_OAUTH_ENABLED } from "@/lib/config";
import { OTHER_ROLE } from "@/lib/validations/roles";
import { OTHER_COLLEGE } from "@/lib/kerala-colleges";

/** "Other" reveals a free-text field client-side; the server resolves it to
 * the actual typed value here so the DB never stores the literal "Other". */
function resolveRole(role: string, other?: string): string {
  return role === OTHER_ROLE ? (other ?? "").trim() : role;
}

/** Computed once from the leader's answer and reused for every member row,
 * so a tampered client payload can't make members disagree on college —
 * there is exactly one college per team, decided server-side. */
function resolveCollege(college: string, other?: string): string {
  return college === OTHER_COLLEGE ? (other ?? "").trim() : college;
}

type SubmitResult =
  | { success: true; accessToken: string }
  | { success: false; error: string };

type SubmitOptions = {
  /** Value of the hidden honeypot input — must be empty for a real user. */
  honeypot?: string;
  /** Cloudflare Turnstile token from the widget on the final step. */
  turnstileToken?: string | null;
};

/**
 * Submits the whole 4-step registration form in one atomic call to the
 * submit_registration() Postgres function (SECURITY DEFINER). There is no
 * participant account — the caller gets back an opaque access token used to
 * view /register/status/[token] afterwards.
 */
export async function submitRegistration(
  data: RegistrationForm,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  // Bots that fill every field (including hidden ones) trip the honeypot.
  // Pretend success without touching the database or revealing detection.
  if (options.honeypot) {
    return { success: true, accessToken: "0".repeat(36) };
  }

  const verified = await verifyTurnstile(options.turnstileToken ?? null);
  if (!verified) {
    return { success: false, error: "Verification failed. Please retry the challenge and submit again." };
  }

  const parsed = registrationFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Some fields are invalid. Please review the form." };
  }
  const { team, members, idea, declarations } = parsed.data;

  try {
    const supabase = await createClient();

    // When Google OAuth is enabled (see lib/config.ts), the leader's email
    // is only meaningful as "verified" if it actually came from the
    // authenticated session — never from whatever the client posted, since
    // a tampered payload could otherwise claim any email as "signed in."
    // While disabled, this whole check is skipped and the submitted email
    // is trusted directly, same as before OAuth existed.
    let leaderEmail: string;
    if (GOOGLE_OAUTH_ENABLED) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        return { success: false, error: "Please sign in with Google to register as team leader." };
      }
      leaderEmail = user.email;
    } else {
      leaderEmail = team.leaderEmail;
    }

    const resolvedCollege = resolveCollege(team.college, team.collegeOther);

    const { data: result, error } = await supabase.rpc("submit_registration", {
      p_team_name: team.teamName,
      p_ai_theme: team.aiTheme,
      p_district: team.district,
      p_leader: {
        full_name: team.leaderName,
        email: leaderEmail,
        phone: team.leaderPhone,
        college: resolvedCollege,
        role_in_team: resolveRole(team.role, team.roleOther),
        id_card_path: team.idCardPath,
      },
      p_members: members.map((m) => ({
        full_name: m.fullName,
        email: m.email,
        phone: m.phone,
        college: resolvedCollege,
        branch: m.branch,
        year: m.year,
        role_in_team: resolveRole(m.roleInTeam, m.roleInTeamOther),
        id_card_path: m.idCardPath,
      })),
      p_problem_statement: idea.problemStatement,
      p_proposed_solution: idea.proposedSolution,
      p_ai_approach: idea.aiApproach,
      p_expected_impact: idea.expectedImpact,
      p_supporting_link: idea.supportingLink ?? "",
      p_deck_path: idea.deckPath ?? "",
      p_declaration_eligibility: declarations.eligibility,
      p_declaration_originality: declarations.originality,
      p_declaration_rules: declarations.rules,
      p_declaration_media_consent: declarations.mediaConsent,
    });

    if (error) {
      // Both exceptions share the same Postgres error class (23505, unique
      // violation), so the message — not the code — is what tells them apart.
      // Checking error.code alone here previously matched the member-email
      // case too and always reported "team name taken", even when the real
      // conflict was a duplicate member email.
      if (error.message?.includes("member email already registered")) {
        return {
          success: false,
          error: "A team member can only join one team, and can't be part of another.",
        };
      }
      if (error.message?.includes("team name taken")) {
        return { success: false, error: "That team name is taken — try another." };
      }
      if (error.message?.includes("team size must be")) {
        return { success: false, error: "Teams need between 2 and 5 members." };
      }
      return { success: false, error: "Something went wrong submitting your registration." };
    }

    const accessToken = (result as { access_token?: string } | null)?.access_token;
    if (!accessToken) {
      return { success: false, error: "Registration didn't return a status link. Contact the organizers." };
    }

    return { success: true, accessToken };
  } catch (err) {
    // A misconfigured Supabase client (bad/missing env vars) or a network
    // failure throws here rather than returning a Supabase `error` object.
    // Without this catch, that exception would propagate out of the Server
    // Action and hit the nearest error boundary — which, before app/error.tsx
    // existed, meant Next's bare unstyled default error page.
    console.error("submitRegistration threw unexpectedly:", err);
    return { success: false, error: "Something went wrong submitting your registration. Please try again." };
  }
}

type StatusResult =
  | {
      found: true;
      team: { name: string; ai_theme: string; district: string; status: string; created_at: string };
      members: Array<{
        id: string;
        full_name: string;
        is_leader: boolean;
        college: string;
        branch: string | null;
        year: string | null;
        role_in_team: string | null;
      }>;
      registration: {
        problem_statement: string;
        proposed_solution: string;
        ai_approach: string;
        expected_impact: string;
        supporting_link: string | null;
        status: string;
        created_at: string;
      };
    }
  | { found: false; systemError?: boolean };

/** Looks up a team's registration status by its opaque access token. */
export async function getRegistrationStatus(token: string): Promise<StatusResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_registration_by_token", { p_token: token });

    if (error || !data) {
      return { found: false };
    }

    return { found: true, ...(data as Omit<Extract<StatusResult, { found: true }>, "found">) };
  } catch (err) {
    // Same reasoning as submitRegistration's catch: a broken Supabase client
    // or network failure shouldn't crash this Server Component and fall
    // back to Next's unstyled default error page — show a real (still
    // styled) message distinguishing "we couldn't check" from "no such
    // registration" instead.
    console.error("getRegistrationStatus threw unexpectedly:", err);
    return { found: false, systemError: true };
  }
}

/**
 * Existence-only check for a team member id, backing the QR/ID-card
 * "Coming Soon" route (/id/[memberId]) — a garbage or malicious id should
 * genuinely 404, not render identically regardless of validity.
 */
export async function checkMemberExists(memberId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("member_exists", { p_member_id: memberId });
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("checkMemberExists threw unexpectedly:", err);
    return false;
  }
}
