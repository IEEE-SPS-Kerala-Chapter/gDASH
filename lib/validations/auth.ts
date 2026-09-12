import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type StaffLogin = z.infer<typeof staffLoginSchema>;
