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

// Full multi-step form, validated again server-side on final submit.
export const registrationFormSchema = z.object({
  team: teamDetailsSchema,
  members: membersStepSchema,
  idea: ideaSchema,
  declarations: declarationsSchema,
});

export type RegistrationForm = z.infer<typeof registrationFormSchema>;
