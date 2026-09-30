import { z } from "zod";
import { AI_THEMES, KERALA_DISTRICTS } from "./team";
import { MEMBER_YEARS } from "./member";
import { emailField } from "./email";
import { ideaSchema } from "./registration";
import { normalizePhone } from "@/lib/phone";

// Same rules as the registration form (and the table CHECK constraints),
// for a super-admin correcting a submitted registration — see
// updateRegistrationDetails in app/actions/admin.ts.
const phoneRegex = /^\+?[0-9]{10,13}$/;
const TEAM_NAME_CHARSET_RE = /^[A-Za-z0-9 '&.-]+$/;

const editMemberSchema = z.object({
  id: z.string().uuid(),
  isLeader: z.boolean(),
  fullName: z.string().trim().min(2, "Enter the full name").max(80, "Name can be at most 80 characters"),
  email: emailField("Enter an email address"),
  phone: z.string().trim().regex(phoneRegex, "Enter a valid phone number (10-13 digits, optional country code)"),
  branch: z.string().trim().min(2, "Enter a branch, e.g. CSE").max(60, "Branch can be at most 60 characters"),
  year: z.enum(MEMBER_YEARS, { message: "Choose a year" }),
  // The leader has no role; everyone else needs one.
  roleInTeam: z.string().trim().max(60, "Role can be at most 60 characters"),
  /** A newly uploaded ID card, or null to keep the current one. */
  idCardPath: z.string().min(1).nullable(),
});

export const registrationEditSchema = z
  .object({
    team: z.object({
      name: z
        .string()
        .trim()
        .min(3, "Team name must be at least 3 characters")
        .max(50, "Team name can be at most 50 characters")
        .regex(TEAM_NAME_CHARSET_RE, "Only letters, numbers, spaces, and ' & . - are allowed")
        .refine((v) => /[A-Za-z]/.test(v), "Team name must include at least one letter"),
      aiTheme: z.enum(AI_THEMES, { message: "Choose an AI theme" }),
      district: z.enum(KERALA_DISTRICTS, { message: "Choose a district" }),
      college: z.string().trim().min(2, "Enter the college").max(120, "College can be at most 120 characters"),
    }),
    members: z.array(editMemberSchema).min(1).max(5),
    /** "none" or an ambassador number as text (see lib/ambassador.ts). */
    ambassador: z.string().regex(/^(none|\d{1,3})$/, "Choose an ambassador or \"No ambassador referred\""),
    idea: ideaSchema.omit({ deckPath: true }).extend({
      /** A newly uploaded deck, or null to keep the current one. */
      deckPath: z.string().min(1).nullable(),
    }),
  })
  .superRefine((data, ctx) => {
    const emails = new Map<string, number>();
    const phones = new Map<string, number>();
    data.members.forEach((m, i) => {
      if (!m.isLeader && m.roleInTeam.length < 2) {
        ctx.addIssue({ code: "custom", path: ["members", i, "roleInTeam"], message: "Enter a role" });
      }
      if (emails.has(m.email)) {
        ctx.addIssue({ code: "custom", path: ["members", i, "email"], message: "Two members can't share an email." });
      }
      emails.set(m.email, i);
      const phone = normalizePhone(m.phone);
      if (phones.has(phone)) {
        ctx.addIssue({ code: "custom", path: ["members", i, "phone"], message: "Two members can't share a phone number." });
      }
      phones.set(phone, i);
    });
  });

export type RegistrationEdit = z.input<typeof registrationEditSchema>;
