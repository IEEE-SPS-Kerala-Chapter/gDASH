import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type StaffLogin = z.infer<typeof staffLoginSchema>;

// Same 8-char minimum already enforced when an admin sets a staff member's
// initial password (app/actions/admin.ts) — kept in sync so a reset can't
// set something weaker than account creation would have allowed.
export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ResetPassword = z.infer<typeof resetPasswordSchema>;
