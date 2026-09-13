import { z } from "zod";
import { teamDetailsSchema } from "./team";
import { membersStepSchema } from "./member";

export const ideaSchema = z.object({
  problemStatement: z
    .string()
    .min(50, "Say more about the problem (at least 50 characters)")
    .max(1500, "Keep it to 1500 characters"),
  proposedSolution: z
    .string()
    .min(50, "Say more about the solution (at least 50 characters)")
    .max(1500, "Keep it to 1500 characters"),
  aiApproach: z
    .string()
    .min(30, "Describe the models/data you'll use (at least 30 characters)")
    .max(1500, "Keep it to 1500 characters"),
  expectedImpact: z
    .string()
    .min(30, "Describe the expected impact (at least 30 characters)")
    .max(1500, "Keep it to 1500 characters"),
  supportingLink: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  deckPath: z.string().optional(),
});

export const declarationsSchema = z.object({
  eligibility: z.literal(true, {
    message: "All members must be eligible students to submit",
  }),
  originality: z.literal(true, {
    message: "You must confirm originality & code ownership to submit",
  }),
  rules: z.literal(true, {
    message: "You must accept the rules & code of conduct to submit",
  }),
  mediaConsent: z.boolean().default(false),
});

export type Idea = z.infer<typeof ideaSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;

/**
 * Reduces a freely-typed college name to a form that's fair to compare
 * across two different people typing the same college: trimmed,
 * lowercased, whitespace-collapsed, and cut at the first comma — so
 * "FISAT, Angamaly" and "FISAT" match, since the part after the comma is
 * almost always just a place name, not part of the college's identity.
 * Exported so the UI can show the same live "does this match?" check the
 * schema uses, instead of only finding out via a validation error.
 */
export function normalizeCollegeName(college: string): string {
  return college
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(",")[0]
    .trim();
}

// Full multi-step form, validated again server-side on final submit.
export const registrationFormSchema = z
  .object({
    team: teamDetailsSchema,
    members: membersStepSchema,
    idea: ideaSchema,
    declarations: declarationsSchema,
  })
  // Catches a duplicate email *within this one submission* (leader re-typed
  // as a member, or two members given the same email by mistake) before it
  // ever reaches the database — the DB's unique index only catches this
  // person already being on a *different* team.
  .superRefine((data, ctx) => {
    const seenBy = new Map<string, string>(); // normalized email -> who had it first

    const leaderEmail = data.team.leaderEmail?.trim().toLowerCase();
    if (leaderEmail) seenBy.set(leaderEmail, "the team leader");

    data.members.forEach((member, index) => {
      const email = member.email?.trim().toLowerCase();
      if (!email) return;
      const existing = seenBy.get(email);
      if (existing) {
        ctx.addIssue({
          code: "custom",
          path: ["members", index, "email"],
          message: `This email is already used by ${existing} above.`,
        });
      } else {
        seenBy.set(email, `member ${index + 2}`);
      }
    });
  })
  // The rules require every member of a team to be from the same college —
  // teams aren't cross-institution. normalizeCollegeName() (trimmed,
  // case-insensitive, whitespace-collapsed, cut at the first comma) means
  // "FISAT" vs "fisat" vs "FISAT, Angamaly" all match as the same college,
  // while an actually different college still doesn't.
  .superRefine((data, ctx) => {
    const leaderCollege = normalizeCollegeName(data.team.college ?? "");
    if (!leaderCollege) return;

    data.members.forEach((member, index) => {
      const memberCollege = normalizeCollegeName(member.college ?? "");
      if (memberCollege && memberCollege !== leaderCollege) {
        ctx.addIssue({
          code: "custom",
          path: ["members", index, "college"],
          message: `Doesn't match the team's college (${data.team.college}). If it's the same college, try dropping the location, e.g. "FISAT" instead of "FISAT, Angamaly".`,
        });
      }
    });
  });

export type RegistrationForm = z.infer<typeof registrationFormSchema>;
