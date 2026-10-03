import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff sign-in lockout, shared by the password step (app/actions/auth.ts)
 * and the 2FA step (app/actions/mfa.ts): 5 failures for an email (or 20
 * from one IP) within an hour lock it for an hour — see
 * supabase/migrations/20261001000000_staff_login_lockout.sql.
 */

export const LOCKED_MESSAGE = (minutes: number) =>
  `Too many failed sign-in attempts. For security, sign-in is locked — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

/** The visitor's IP as seen by Vercel's edge (first x-forwarded-for entry). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
}

export function minutesUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

type LockStatus = { locked: boolean; locked_until: string | null; email_failures: number };

/** The current lock state, or null if it couldn't be checked (callers refuse then). */
export async function staffLockStatus(email: string, ip: string): Promise<LockStatus | null> {
  const { data, error } = await createAdminClient().rpc("staff_login_status", { p_email: email, p_ip: ip });
  if (error || !data) {
    console.error("staff_login_status failed:", error);
    return null;
  }
  return data as LockStatus;
}

export async function recordStaffAttempt(email: string, ip: string, succeeded: boolean): Promise<void> {
  await createAdminClient().rpc("staff_login_record", { p_email: email, p_ip: ip, p_succeeded: succeeded });
}
