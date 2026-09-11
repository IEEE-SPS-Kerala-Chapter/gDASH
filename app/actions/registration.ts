"use server";

import { createClient } from "@/lib/supabase/server";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { verifyTurnstile } from "@/lib/turnstile";

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

  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("submit_registration", {
    p_team_name: team.teamName,
    p_ai_theme: team.aiTheme,
    p_district: team.district,
    p_leader: {
      full_name: team.leaderName,
      email: team.leaderEmail,
      phone: team.leaderPhone,
      college: team.college,
    },
    p_members: members.map((m) => ({
      full_name: m.fullName,
      email: m.email,
      phone: m.phone,
      college: m.college,
      branch: m.branch,
      year: m.year,
      role_in_team: m.roleInTeam,
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
    if (error.code === "23505" || error.message?.includes("team name taken")) {
      return { success: false, error: "That team name is taken — try another." };
    }
    if (error.message?.includes("member email already registered")) {
      return {
        success: false,
        error: "One of these members is already registered on another team.",
      };
    }
    return { success: false, error: "Something went wrong submitting your registration." };
  }

  const accessToken = (result as { access_token?: string } | null)?.access_token;
  if (!accessToken) {
    return { success: false, error: "Registration didn't return a status link. Contact the organizers." };
  }

  return { success: true, accessToken };
}

type StatusResult =
  | {
      found: true;
      team: { name: string; ai_theme: string; district: string; status: string; created_at: string };
      members: Array<{
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
  | { found: false };

/** Looks up a team's registration status by its opaque access token. */
export async function getRegistrationStatus(token: string): Promise<StatusResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_registration_by_token", { p_token: token });

  if (error || !data) {
    return { found: false };
  }

  return { found: true, ...(data as Omit<Extract<StatusResult, { found: true }>, "found">) };
}
