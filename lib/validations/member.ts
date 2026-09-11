import { z } from "zod";

export const MEMBER_YEARS = ["1st year", "2nd year", "3rd year", "4th year", "PG"] as const;

const phoneRegex = /^\+?[0-9]{10,13}$/;

export const memberSchema = z.object({
  fullName: z.string().min(2, "Enter the member's full name").max(80),
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .regex(phoneRegex, "Enter a valid phone number (10-13 digits, optional country code)"),
  college: z.string().min(2, "Enter a college / institution").max(120),
  branch: z.string().min(2, "Enter a branch, e.g. CSE").max(60),
  year: z.enum(MEMBER_YEARS, { message: "Choose a year" }),
  roleInTeam: z.string().min(2, "Enter a role, e.g. ML engineer").max(60),
});

export type Member = z.infer<typeof memberSchema>;

// Up to 4 additional members alongside the leader (max team size: 5).
export const membersStepSchema = z.array(memberSchema).max(4, "A team can have at most 5 members total");
