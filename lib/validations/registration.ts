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
  mediaConsent: z.boolean().default(false),
});

export type Idea = z.infer<typeof ideaSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;

// Full multi-step form, validated again server-side on final submit.
export const registrationFormSchema = z
  .object({
    team: teamDetailsSchema,
    members: membersStepSchema,
    idea: ideaSchema,
    declarations: declarationsSchema,
  })
  // Catches a duplicate email or phone *within this one submission* (leader
  // re-typed as a member, or two members given the same contact info by
  // mistake) before it ever reaches the database — the DB's unique indexes
  // only catch this person already being on a *different* team. Phone is
  // compared via normalizePhone() so "+919876543210" and "9876543210"
  // within the same form are also caught as the same number.
  .superRefine((data, ctx) => {
    const emailSeenBy = new Map<string, string>(); // normalized email -> who had it first
    const phoneSeenBy = new Map<string, string>(); // normalized phone -> who had it first

    const leaderEmail = data.team.leaderEmail?.trim().toLowerCase();
    if (leaderEmail) emailSeenBy.set(leaderEmail, "the team leader");
    const leaderPhone = data.team.leaderPhone ? normalizePhone(data.team.leaderPhone) : "";
    if (leaderPhone) phoneSeenBy.set(leaderPhone, "the team leader");

    data.members.forEach((member, index) => {
      const email = member.email?.trim().toLowerCase();
      if (email) {
        const existing = emailSeenBy.get(email);
        if (existing) {
          ctx.addIssue({
            code: "custom",
            path: ["members", index, "email"],
            message: `This email is already used by ${existing} above.`,
          });
        } else {
          emailSeenBy.set(email, `member ${index + 2}`);
        }
      }

      const phone = member.phone ? normalizePhone(member.phone) : "";
      if (phone) {
        const existing = phoneSeenBy.get(phone);
        if (existing) {
          ctx.addIssue({
            code: "custom",
            path: ["members", index, "phone"],
            message: `This phone number is already used by ${existing} above.`,
          });
        } else {
          phoneSeenBy.set(phone, `member ${index + 2}`);
        }
      }
    });
  });

export type RegistrationForm = z.infer<typeof registrationFormSchema>;
