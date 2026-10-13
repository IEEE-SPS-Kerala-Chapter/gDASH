import { z } from "zod";
import { teamDetailsSchema } from "./team";
import { membersStepSchema } from "./member";
import { normalizePhone } from "@/lib/phone";

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
  deckPath: z.string().min(1, "Upload your supporting material"),
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
  // Required since the 2026-10 copy update (gignite.docx): media consent is
  // now one of the four declarations every squad must confirm.
  mediaConsent: z.literal(true, {
    message: "You must agree to media consent to submit",
  }),
});

export type Idea = z.infer<typeof ideaSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;

/** Name as compared for duplicates: case, dots and extra spaces ignored ("Anu  K." = "anu k"). */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A duplicate name, email or phone *within this one submission* (leader
 * re-typed as a member, or a member card copied and not changed) — the
 * DB's unique indexes only catch an email or phone already being on a
 * *different* team. Phone is compared via normalizePhone() so
 * "+919876543210" and "9876543210" are caught as the same number.
 *
 * Exported so the wizard can run it on the Members step's Continue: as a
 * refinement on the whole form it only runs once every other field is
 * valid, i.e. never before the final Submit.
 */
export function findDuplicateContacts(
  team: { leaderName?: string; leaderEmail?: string; leaderPhone?: string },
  members: { fullName?: string; email?: string; phone?: string }[],
): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const nameSeenBy = new Map<string, string>(); // normalized name -> who had it first
  const emailSeenBy = new Map<string, string>(); // normalized email -> who had it first
  const phoneSeenBy = new Map<string, string>(); // normalized phone -> who had it first

  const leaderName = team.leaderName ? normalizeName(team.leaderName) : "";
  if (leaderName) nameSeenBy.set(leaderName, "the Squad Leader");
  const leaderEmail = team.leaderEmail?.trim().toLowerCase();
  if (leaderEmail) emailSeenBy.set(leaderEmail, "the Squad Leader");
  const leaderPhone = team.leaderPhone ? normalizePhone(team.leaderPhone) : "";
  if (leaderPhone) phoneSeenBy.set(leaderPhone, "the Squad Leader");

  members.forEach((member, index) => {
    const name = member.fullName ? normalizeName(member.fullName) : "";
    if (name) {
      const existing = nameSeenBy.get(name);
      if (existing) {
        issues.push({
          path: ["members", index, "fullName"],
          message: `This name is already used by ${existing}. Enter each member's own full name.`,
        });
      } else {
        nameSeenBy.set(name, `Member ${index + 2}`);
      }
    }

    const email = member.email?.trim().toLowerCase();
    if (email) {
      const existing = emailSeenBy.get(email);
      if (existing) {
        issues.push({
          path: ["members", index, "email"],
          message: `This email is already used by ${existing}. Each member needs their own email.`,
        });
      } else {
        emailSeenBy.set(email, `Member ${index + 2}`);
      }
    }

    const phone = member.phone ? normalizePhone(member.phone) : "";
    if (phone) {
      const existing = phoneSeenBy.get(phone);
      if (existing) {
        issues.push({
          path: ["members", index, "phone"],
          message: `This phone number is already used by ${existing}. Each member needs their own number.`,
        });
      } else {
        phoneSeenBy.set(phone, `Member ${index + 2}`);
      }
    }
  });
  return issues;
}

// Full multi-step form, validated again server-side on final submit.
export const registrationFormSchema = z
  .object({
    team: teamDetailsSchema,
    members: membersStepSchema,
    idea: ideaSchema,
    declarations: declarationsSchema,
  })
  .superRefine((data, ctx) => {
    for (const issue of findDuplicateContacts(data.team, data.members)) {
      ctx.addIssue({ code: "custom", ...issue });
    }
  });

export type RegistrationForm = z.infer<typeof registrationFormSchema>;
