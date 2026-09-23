import { z } from "zod";
import { MEMBER_YEARS } from "./member";
import { emailField } from "./email";
import { KERALA_BTECH_COLLEGES, OTHER_COLLEGE } from "@/lib/kerala-colleges";

export const AI_THEMES = [
  "AI for Disaster Management",
  "AI for Healthcare",
  "AI for Mobility & Transportation",
  "AI for Smart Cities",
  "Open Innovation Track",
] as const;

export const KERALA_DISTRICTS = [
  "Ernakulam",
  "Thiruvananthapuram",
  "Kozhikode",
  "Thrissur",
  "Kollam",
  "Kottayam",
] as const;

const phoneRegex = /^\+?[0-9]{10,13}$/;

// Mirrors the teams_name_charset CHECK constraint in
// supabase/migrations/20260922000000_team_name_validation.sql — letters,
// digits, spaces, and a small safe punctuation set, with at least one
// letter (so "123" or "---" alone can't be a team name).
const TEAM_NAME_CHARSET_RE = /^[A-Za-z0-9 '&.-]+$/;
const TEAM_NAME_HAS_LETTER_RE = /[A-Za-z]/;

export const teamDetailsSchema = z
  .object({
    teamName: z
      .string()
      .trim()
      .min(3, "Team name must be at least 3 characters")
      .max(50, "Team name can be at most 50 characters")
      .regex(TEAM_NAME_CHARSET_RE, "Only letters, numbers, spaces, and ' & . - are allowed")
      .refine((v) => TEAM_NAME_HAS_LETTER_RE.test(v), "Team name must include at least one letter"),
    aiTheme: z.enum(AI_THEMES, { message: "Choose an AI theme" }),
    leaderName: z.string().trim().min(2, "Enter the leader's full name").max(80, "Name can be at most 80 characters"),
    leaderEmail: emailField("Enter your email address"),
    leaderPhone: z
      .string()
      .trim()
      .regex(phoneRegex, "Enter a valid phone number (10-13 digits, optional country code)"),
    // One college for the whole team, collected once from the leader — see
    // resolveCollege() in app/actions/registration.ts, which copies this
    // same value onto every member row server-side.
    //
    // The custom message is set on EACH branch, not on the union itself:
    // @hookform/resolvers' zod4 adapter ignores a union-level message and
    // instead surfaces whichever branch came closest to matching — and
    // Zod v4's default mismatch message for z.enum lists every valid value,
    // which without this would render as "Invalid option" followed by every
    // college name, in red, under the field.
    college: z.union(
      [
        z.enum(KERALA_BTECH_COLLEGES, { message: "Choose your college" }),
        z.literal(OTHER_COLLEGE, { message: "Choose your college" }),
      ],
      { message: "Choose your college" },
    ),
    collegeOther: z.string().trim().max(120, "College name can be at most 120 characters").optional(),
    district: z.enum(KERALA_DISTRICTS, { message: "Choose a district" }),
    branch: z.string().trim().min(2, "Enter a branch, e.g. CSE").max(60, "Branch can be at most 60 characters"),
    year: z.enum(MEMBER_YEARS, { message: "Choose a year" }),
    idCardPath: z.string().min(1, "Upload your ID card"),
  })
  .superRefine((data, ctx) => {
    if (data.college === OTHER_COLLEGE && !data.collegeOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["collegeOther"], message: "Enter your college's name" });
    }
  });

export type TeamDetails = z.infer<typeof teamDetailsSchema>;
