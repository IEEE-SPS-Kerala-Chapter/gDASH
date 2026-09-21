import { useCallback, useRef, type FocusEvent } from "react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { checkContactAvailability, checkTeamNameAvailability } from "@/app/actions/registration";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{10,13}$/;

/**
 * Wires a field to a live "already registered with another team" check
 * against past submissions (see checkContactAvailability). Complements the
 * in-form duplicate check already built into registrationFormSchema, which
 * only catches a collision *within* the current submission — this one only
 * ever asks the database, about one field at a time, once it's already
 * valid-looking (no point round-tripping an obviously malformed value).
 */
export function useDuplicateContactCheck(form: UseFormReturn<RegistrationForm>) {
  // Guards against a slow, stale response overwriting a newer one for the
  // same field (e.g. the user fixes a typo and blurs again before the
  // first check returns) — only a result for the *latest* requested value
  // is ever applied.
  const latestValue = useRef<Map<string, string>>(new Map());

  const checkValue = useCallback(
    async (path: FieldPath<RegistrationForm>, kind: "email" | "phone", rawValue: string) => {
      const value = rawValue.trim();
      latestValue.current.set(path, value);
      if (!value) return;
      if (kind === "email" && !EMAIL_RE.test(value)) return;
      if (kind === "phone" && !PHONE_RE.test(value)) return;

      const result = await checkContactAvailability(kind === "email" ? { email: value } : { phone: value });

      // A newer blur on this same field already superseded this request.
      if (latestValue.current.get(path) !== value) return;

      const taken = kind === "email" ? result.emailTaken : result.phoneTaken;
      if (taken) {
        form.setError(path, {
          type: "duplicate",
          message:
            kind === "email"
              ? "This email is already registered with another team."
              : "This phone number is already registered with another team.",
        });
      } else if (form.getFieldState(path).error?.type === "duplicate") {
        form.clearErrors(path);
      }
    },
    [form],
  );

  const onBlurCheck = useCallback(
    (path: FieldPath<RegistrationForm>, kind: "email" | "phone") => (e: FocusEvent<HTMLInputElement>) => {
      void checkValue(path, kind, e.target.value);
    },
    [checkValue],
  );

  return { checkValue, onBlurCheck };
}

/**
 * Same idea as useDuplicateContactCheck, but for the team name field: a
 * live check against check_team_name_available(), which can report either
 * an exact ("taken") or a fuzzy near-duplicate ("similar") match — both
 * hard-blocked at final submit by submit_registration() itself, so this is
 * just surfacing that same rejection earlier, not a softer warning.
 */
export function useTeamNameCheck(form: UseFormReturn<RegistrationForm>) {
  const latestValue = useRef("");

  const onBlur = useCallback(
    async (e: FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      latestValue.current = value;
      // Fewer than 3 chars already fails the sync min-length rule — no
      // point round-tripping a value that's already invalid for another
      // reason.
      if (value.length < 3) return;

      const result = await checkTeamNameAvailability(value);
      if (latestValue.current !== value) return;

      if (!result.available) {
        form.setError("team.teamName", {
          type: "duplicate",
          message:
            result.reason === "taken"
              ? "That team name is already taken."
              : result.similarTo
                ? `Too similar to an existing team ("${result.similarTo}") — try something more distinct.`
                : "Too similar to an existing team — try something more distinct.",
        });
      } else if (form.getFieldState("team.teamName").error?.type === "duplicate") {
        form.clearErrors("team.teamName");
      }
    },
    [form],
  );

  return { onBlur };
}
