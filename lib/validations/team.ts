import { z } from "zod";

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

export const teamDetailsSchema = z.object({
  teamName: z.string().min(3, "Team name must be at least 3 characters").max(50),
  aiTheme: z.enum(AI_THEMES, { message: "Choose an AI theme" }),
  leaderName: z.string().min(2, "Enter the leader's full name").max(80),
  leaderEmail: z.string().email("Enter a valid email address"),
  leaderPhone: z
    .string()
    .regex(phoneRegex, "Enter a valid phone number (10-13 digits, optional country code)"),
  college: z.string().min(2, "Enter a college / institution").max(120),
  district: z.enum(KERALA_DISTRICTS, { message: "Choose a district" }),
});

export type TeamDetails = z.infer<typeof teamDetailsSchema>;
