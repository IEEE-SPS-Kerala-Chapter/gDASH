"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { verifyTurnstile } from "@/lib/turnstile";
import { LEADER_VERIFICATION_ENABLED } from "@/lib/config";
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

    // When leader verification is enabled (see lib/config.ts), the leader's
    // email is only meaningful as "verified" if it actually came from the
    // authenticated session — never from whatever the client posted, since
    // a tampered payload could otherwise claim any email as "signed in."
    // Works the same regardless of which provider produced the session
    // (Google OAuth or the emailed sign-in code). While disabled, this whole
    // check is skipped and the submitted email is trusted directly, same
    // as before verification existed.
    let leaderEmail: string;
    let leaderUserId: string | null = null;
    if (LEADER_VERIFICATION_ENABLED) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        return { success: false, error: "Please verify your email to register as team leader." };
      }
      leaderEmail = user.email;
      leaderUserId = user.id;
    } else {
      leaderEmail = team.leaderEmail;
    }

    const resolvedCollege = resolveCollege(team.college, team.collegeOther);
    // Everyone on the form, labelled the way the wizard shows them — used to
    // name the person in a "already on another team" error below.
    const people: ContactPerson[] = [
      { label: `the team leader (${team.leaderName})`, email: leaderEmail, phone: team.leaderPhone },
      ...members.map((m, i) => ({ label: `Member ${i + 2} (${m.fullName})`, email: m.email, phone: m.phone })),
    ];

    const { data: result, error } = await supabase.rpc("submit_registration", {
      p_team_name: team.teamName,
      p_ai_theme: team.aiTheme,
      p_district: team.district,
      p_leader: {
        full_name: team.leaderName,
        email: leaderEmail,
        phone: team.leaderPhone,
        college: resolvedCollege,
        branch: team.branch,
        year: team.year,
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
      p_deck_path: idea.deckPath,
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
        const who = await findAlreadyRegistered(supabase, people, "email");
        return {
          success: false,
          error: who
            ? `The email for ${who.label}, ${who.value}, is already registered with another team. Each person can only be on one team.`
            : "One of your team's emails is already registered with another team. Each person can only be on one team.",
        };
      }
      if (error.message?.includes("member phone already registered")) {
        const who = await findAlreadyRegistered(supabase, people, "phone");
        return {
          success: false,
          error: who
            ? `The phone number for ${who.label}, ${who.value}, is already registered with another team.`
            : "One of your team's phone numbers is already registered with another team.",
        };
      }
      if (error.message?.includes("team name taken")) {
        return { success: false, error: "That team name is taken — try another." };
      }
      if (error.message?.includes("team name too similar to an existing team")) {
        const similarTo = error.message.split(":").slice(1).join(":").trim();
        return {
          success: false,
          error: similarTo
            ? `That team name is too similar to an existing team ("${similarTo}") — try something more distinct.`
            : "That team name is too similar to an existing team — try something more distinct.",
        };
      }
      if (error.message?.includes("team size must be")) {
        return { success: false, error: "Teams need between 2 and 5 members." };
      }
      if (error.message?.includes("registration is closed")) {
        return { success: false, error: "Registration is closed. Contact the organizers if you think this is a mistake." };
      }
      return { success: false, error: "Something went wrong submitting your registration." };
    }

    const accessToken = (result as { access_token?: string } | null)?.access_token;
    if (!accessToken) {
      return { success: false, error: "Registration didn't return a status link. Contact the organizers." };
    }

    // A real submission exists now — clear the draft so there's nothing
    // left to resume, and so a later visit to /register never re-offers an
    // already-submitted team's data. Best-effort: a failure here shouldn't
    // undo a successful submission, just leaves a harmless stale row.
    if (leaderUserId) {
      const { error: draftError } = await supabase.from("registration_drafts").delete().eq("leader_id", leaderUserId);
      if (draftError) {
        console.error("Could not clear registration draft after submit:", draftError.message);
      }
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

type ContactPerson = { label: string; email: string; phone: string };

/**
 * submit_registration() only says *that* an email/phone is already on
 * another team, not whose — this checks each person in turn so the error
 * can name them. Only runs after that failure, never on the happy path.
 */
async function findAlreadyRegistered(
  supabase: Awaited<ReturnType<typeof createClient>>,
  people: ContactPerson[],
  kind: "email" | "phone",
): Promise<{ label: string; value: string } | null> {
  for (const person of people) {
    const value = kind === "email" ? person.email : person.phone;
    const { data } = await supabase.rpc("check_duplicate_contact", {
      p_email: kind === "email" ? value.trim() : null,
      p_phone: kind === "phone" ? value.trim() : null,
    });
    const result = data as { email_taken?: boolean; phone_taken?: boolean } | null;
    if (kind === "email" ? result?.email_taken : result?.phone_taken) {
      return { label: person.label, value };
    }
  }
  return null;
}

type StatusResult =
  | {
      found: true;
      team: { name: string; entry_code: string; ai_theme: string; district: string; status: string; created_at: string };
      members: Array<{
        id: string;
        member_code: string;
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

type DraftResult = { success: true } | { success: false; error: string };

/**
 * Upserts the signed-in leader's one server-side draft row (one per leader,
 * see registration_drafts' unique leader_id). Called by the wizard's
 * debounced autosave and its "Save draft" button — this is the only place
 * registration progress is kept (nothing is stored in the browser). With no
 * signed-in user (e.g. the session expired) there's no identity to key a
 * draft on, so this returns a clear error rather than silently no-op.
 */
export async function saveRegistrationDraft(value: RegistrationForm, step: number): Promise<DraftResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Your session has expired. Sign in again to keep saving your progress." };
    }

    const { error } = await supabase
      .from("registration_drafts")
      .upsert({ leader_id: user.id, value, step }, { onConflict: "leader_id" });

    if (error) {
      return { success: false, error: "Could not save your draft." };
    }
    return { success: true };
  } catch (err) {
    console.error("saveRegistrationDraft threw unexpectedly:", err);
    return { success: false, error: "Could not save your draft." };
  }
}

export type LoadedDraft =
  | { status: "found"; value: RegistrationForm; step: number }
  | { status: "none" }
  | { status: "error" };

/**
 * The signed-in leader's saved draft, if any — loaded whenever they return
 * to /register, on any device. "error" is kept distinct from "none": the
 * wizard autosaves, so treating a failed lookup as "no draft" would show an
 * empty form whose first autosave overwrites the real draft.
 */
export async function loadRegistrationDraft(): Promise<LoadedDraft> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "none" };

    const { data, error } = await supabase
      .from("registration_drafts")
      .select("value, step")
      .eq("leader_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("loadRegistrationDraft failed:", error);
      return { status: "error" };
    }
    if (!data) return { status: "none" };
    return { status: "found", value: data.value as RegistrationForm, step: data.step };
  } catch (err) {
    console.error("loadRegistrationDraft threw unexpectedly:", err);
    return { status: "error" };
  }
}

export type ContactAvailability = { emailTaken: boolean; phoneTaken: boolean };

/**
 * Live pre-submit check: does this email/phone already belong to a team from
 * a previous submission? Complements registrationFormSchema's superRefine,
 * which only catches a duplicate *within* the current, still-unsubmitted
 * form — this one asks the database, so a collision with someone else's
 * past registration surfaces while the leader is still filling the form,
 * not only after the final submit.
 */
export async function checkContactAvailability(input: {
  email?: string;
  phone?: string;
}): Promise<ContactAvailability> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_duplicate_contact", {
      p_email: input.email?.trim() || null,
      p_phone: input.phone?.trim() || null,
    });
    if (error || !data) return { emailTaken: false, phoneTaken: false };
    const result = data as { email_taken?: boolean; phone_taken?: boolean };
    return { emailTaken: Boolean(result.email_taken), phoneTaken: Boolean(result.phone_taken) };
  } catch (err) {
    console.error("checkContactAvailability threw unexpectedly:", err);
    return { emailTaken: false, phoneTaken: false };
  }
}

export type TeamNameAvailability =
  | { available: true; reason: null; similarTo: null }
  | { available: false; reason: "taken" | "similar"; similarTo: string | null };

const TEAM_NAME_AVAILABLE: TeamNameAvailability = { available: true, reason: null, similarTo: null };

/**
 * Live pre-submit check for the team name field: is it already taken
 * (exact, whitespace/case-insensitive), or too close to an existing name
 * to pass the hard similarity block inside submit_registration()? Mirrors
 * checkContactAvailability's role for email/phone.
 */
export async function checkTeamNameAvailability(teamName: string): Promise<TeamNameAvailability> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_team_name_available", { p_team_name: teamName.trim() });
    if (error || !data) return TEAM_NAME_AVAILABLE;
    const result = data as { available?: boolean; reason?: "taken" | "similar" | null; similar_to?: string | null };
    if (result.available !== false) return TEAM_NAME_AVAILABLE;
    return {
      available: false,
      reason: result.reason === "similar" ? "similar" : "taken",
      similarTo: result.similar_to ?? null,
    };
  } catch (err) {
    console.error("checkTeamNameAvailability threw unexpectedly:", err);
    return TEAM_NAME_AVAILABLE;
  }
}

type IdCardPreviewResult = { success: true; url: string } | { success: false; error: string };

/**
 * A short-lived signed URL for a just-uploaded ID card, so the Review step
 * (components/registration/step-review.tsx) can show it back to the leader
 * before they submit — including after resuming a saved draft, when the
 * browser no longer has the original File in memory.
 *
 * Deliberately callable by anyone (no auth/staff check, unlike every other
 * use of the service-role client in this codebase — see createAdminClient's
 * own doc comment). Registration itself is authless-capable by design (see
 * init_schema.sql), and this needs to work in that mode too, not just when
 * LEADER_VERIFICATION_ENABLED. The path itself is the credential instead:
 * IdCardUploadField writes it as `${crypto.randomUUID()}-${file.name}`, so
 * knowing it already means either being the uploader (it's only ever handed
 * back to their own browser's form state) or being staff (who have their
 * own separate, gated path to the same files via getMemberIdCardDownloadUrl
 * in app/actions/admin.ts) — same trust model teams.access_token already
 * uses elsewhere in this schema. It's also never returned by
 * get_registration_by_token, so it can't leak via the public status page.
 */
export async function getIdCardPreviewUrl(path: string): Promise<IdCardPreviewResult> {
  if (!path) {
    return { success: false, error: "No ID card uploaded yet." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("member-id-cards").createSignedUrl(path, 60 * 5); // 5 minutes

  if (error || !data) {
    return { success: false, error: "Could not load ID card preview." };
  }
  return { success: true, url: data.signedUrl };
}
