import { z } from "zod";
import { TEAM_ROLES, OTHER_ROLE } from "./roles";

export const MEMBER_YEARS = ["1st year", "2nd year", "3rd year", "4th year", "PG"] as const;

const phoneRegex = /^\+?[0-9]{10,13}$/;

export const memberSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the member's full name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .regex(phoneRegex, "Enter a valid phone number (10-13 digits, optional country code)"),
    // College is a single, team-level fact collected once from the leader
    // (see teamDetailsSchema) — not collected per member anymore.
    branch: z.string().trim().min(2, "Enter a branch, e.g. CSE").max(60),
    year: z.enum(MEMBER_YEARS, { message: "Choose a year" }),
    roleInTeam: z.enum(TEAM_ROLES, { message: "Choose a role" }),
    roleInTeamOther: z.string().trim().max(60).optional(),
    idCardPath: z.string().min(1, "Upload an ID card"),
  })
  .superRefine((data, ctx) => {
    if (data.roleInTeam === OTHER_ROLE && !data.roleInTeamOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["roleInTeamOther"], message: "Enter a role" });
    }
  });

export type Member = z.infer<typeof memberSchema>;

// Additional members only (the leader is collected separately in
// teamDetailsSchema) — 1..4 of these makes a 2..5 person team total.
export const membersStepSchema = z
  .array(memberSchema)
  .min(1, "A team needs at least 2 members total (you + 1 more)")
  .max(4, "A team can have at most 5 members total");
