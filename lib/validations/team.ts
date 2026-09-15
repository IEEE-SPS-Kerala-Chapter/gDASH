import { z } from "zod";
import { TEAM_ROLES, OTHER_ROLE } from "./roles";
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

export const teamDetailsSchema = z
  .object({
    teamName: z.string().trim().min(3, "Team name must be at least 3 characters").max(50),
    aiTheme: z.enum(AI_THEMES, { message: "Choose an AI theme" }),
    leaderName: z.string().trim().min(2, "Enter the leader's full name").max(80),
    leaderEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
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
    collegeOther: z.string().trim().max(120).optional(),
    district: z.enum(KERALA_DISTRICTS, { message: "Choose a district" }),
    role: z.enum(TEAM_ROLES, { message: "Choose your role in the team" }),
    roleOther: z.string().trim().max(60).optional(),
    idCardPath: z.string().min(1, "Upload your ID card"),
  })
  .superRefine((data, ctx) => {
    if (data.college === OTHER_COLLEGE && !data.collegeOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["collegeOther"], message: "Enter your college's name" });
    }
    if (data.role === OTHER_ROLE && !data.roleOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["roleOther"], message: "Enter your role" });
    }
  });

export type TeamDetails = z.infer<typeof teamDetailsSchema>;
