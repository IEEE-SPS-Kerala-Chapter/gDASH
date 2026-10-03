"use server";

import { createHash, randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit-log";
import { hasVerifiedTotp } from "@/lib/staff-mfa";
import { LOCKED_MESSAGE, clientIp, minutesUntil, recordStaffAttempt, staffLockStatus } from "@/lib/staff-lockout";

/**
 * Staff 2FA with an authenticator app (Supabase MFA, TOTP). A password-only
 * session is aal1; enrolling or entering the code upgrades it to aal2, which
 * every staff power requires (supabase/migrations/20261006000000_staff_mfa.sql).
 * All calls use the cookie session client, so the upgraded session is saved
 * in the usual HttpOnly cookies. Wrong codes count towards the staff sign-in
 * lockout, like wrong passwords.
 *
 * Backup codes are ours (Supabase's are experimental): 10 one-time codes,
 * stored hashed. Using one removes the lost authenticator and goes straight
 * to setting up a new one — it never signs anyone in by itself.
 */

const STAFF_ROLES = ["admin", "judge", "volunteer", "super_admin"];
const CODE_RE = /^\d{6}$/;
// No 0/O, 1/I/L — easy to read back from paper.
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type Fail = { success: false; error: string };

/** The signed-in staff user (2FA not required — that's what these actions are for). */
async function staffUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !STAFF_ROLES.includes(profile.role)) return null;
  return { supabase, user, email: user.email };
}

/** Refuses while the account is locked; null when the attempt may go ahead. */
async function lockError(email: string, ip: string): Promise<Fail | null> {
  const status = await staffLockStatus(email, ip);
  if (!status) return { success: false, error: "Sign-in is temporarily unavailable. Please try again shortly." };
  if (status.locked && status.locked_until) return { success: false, error: LOCKED_MESSAGE(minutesUntil(status.locked_until)) };
  return null;
}

/** A wrong code: count it, and say so if it was the one that locked the account. */
async function wrongCode(email: string, ip: string, message: string): Promise<Fail> {
  await recordStaffAttempt(email, ip, false);
  const status = await staffLockStatus(email, ip);
  if (status?.locked && status.locked_until) return { success: false, error: LOCKED_MESSAGE(minutesUntil(status.locked_until)) };
  const left = status ? Math.max(0, 5 - status.email_failures) : null;
  return {
    success: false,
    error: left !== null && left <= 2 ? `${message} ${left} attempt${left === 1 ? "" : "s"} left before sign-in is locked for 1 hour.` : message,
  };
}

function hashBackupCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newBackupCode(): string {
  const chars = Array.from({ length: 10 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Replaces the user's backup codes with 10 new ones; returns them in plain text (shown once). */
async function issueBackupCodes(userId: string): Promise<string[] | null> {
  const codes = Array.from({ length: 10 }, newBackupCode);
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("staff_mfa_backup_codes").delete().eq("user_id", userId);
  if (deleteError) return null;
  const { error } = await admin
    .from("staff_mfa_backup_codes")
    .insert(codes.map((c) => ({ user_id: userId, code_hash: hashBackupCode(userId, normalizeBackupCode(c)) })));
  return error ? null : codes;
}

/** First step of setup: a new authenticator secret and its QR code. */
export async function startTotpSetup(): Promise<
  { success: true; factorId: string; qrCode: string; secret: string } | Fail
> {
  const staff = await staffUser();
  if (!staff) return { success: false, error: "Please sign in again." };
  if (hasVerifiedTotp(staff.user)) {
    return { success: false, error: "Two-factor sign-in is already set up — enter the code from your app." };
  }

  // A setup started earlier and never finished leaves an unverified factor;
  // clear it so this one can start fresh.
  const { data: factors } = await staff.supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await staff.supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await staff.supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "gIGNITE Staff",
    friendlyName: "Authenticator app",
  });
  if (error || !data) {
    console.error("mfa.enroll failed:", error?.message);
    return { success: false, error: "Couldn't start two-factor setup. Please try again." };
  }
  return { success: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Second step of setup: confirm the app's first code. Returns the backup codes (shown once). */
export async function confirmTotpSetup(factorId: string, code: string): Promise<{ success: true; backupCodes: string[] } | Fail> {
  const staff = await staffUser();
  if (!staff) return { success: false, error: "Please sign in again." };
  if (!CODE_RE.test(code.trim())) return { success: false, error: "Enter the 6-digit code from your app." };

  const ip = await clientIp();
  const locked = await lockError(staff.email, ip);
  if (locked) return locked;

  const { error } = await staff.supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) {
    return wrongCode(staff.email, ip, "That code didn't match. Check the time on your phone is automatic and try the newest code.");
  }
  await recordStaffAttempt(staff.email, ip, true);

  const backupCodes = await issueBackupCodes(staff.user.id);
  await logAuditEvent(staff.supabase, "auth.mfa_enrolled");
  if (!backupCodes) {
    // 2FA itself is on; only the backup codes failed. They can be made
    // again by a super-admin reset, so don't block the sign-in over it.
    return { success: true, backupCodes: [] };
  }
  return { success: true, backupCodes };
}

/** Every sign-in after setup: the 6-digit code from the app. */
export async function verifyTotp(code: string): Promise<{ success: true } | Fail> {
  const staff = await staffUser();
  if (!staff) return { success: false, error: "Please sign in again." };
  if (!CODE_RE.test(code.trim())) return { success: false, error: "Enter the 6-digit code from your app." };

  const ip = await clientIp();
  const locked = await lockError(staff.email, ip);
  if (locked) return locked;

  const { data: factors } = await staff.supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { success: false, error: "Two-factor sign-in isn't set up yet — reload the page." };

  const { error } = await staff.supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
  if (error) {
    return wrongCode(staff.email, ip, "That code didn't match. Try the newest code from your app.");
  }
  await recordStaffAttempt(staff.email, ip, true);
  await logAuditEvent(staff.supabase, "auth.mfa_verified");
  return { success: true };
}

/**
 * Lost phone: a backup code proves it's you, removes the old authenticator,
 * and the page continues to setting up a new one. Each code works once.
 */
export async function redeemBackupCode(code: string): Promise<{ success: true } | Fail> {
  const staff = await staffUser();
  if (!staff) return { success: false, error: "Please sign in again." };
  const normalized = normalizeBackupCode(code);
  if (normalized.length !== 10) return { success: false, error: "Enter a backup code like ABCDE-FGH23." };

  const ip = await clientIp();
  const locked = await lockError(staff.email, ip);
  if (locked) return locked;

  const admin = createAdminClient();
  const { data: match } = await admin
    .from("staff_mfa_backup_codes")
    .select("id")
    .eq("user_id", staff.user.id)
    .eq("code_hash", hashBackupCode(staff.user.id, normalized))
    .is("used_at", null)
    .maybeSingle();
  if (!match) {
    return wrongCode(staff.email, ip, "That backup code isn't valid or was already used.");
  }

  // Only the first use wins, even if two requests race.
  const { data: used } = await admin
    .from("staff_mfa_backup_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", match.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!used) {
    return wrongCode(staff.email, ip, "That backup code isn't valid or was already used.");
  }

  const { data: factorList, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: staff.user.id });
  if (listError) {
    return { success: false, error: "Couldn't reset two-factor sign-in. Please try again or ask the super-admin." };
  }
  for (const f of factorList?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: staff.user.id });
  }

  await recordStaffAttempt(staff.email, ip, true);
  await logAuditEvent(staff.supabase, "auth.mfa_backup_code_used");
  return { success: true };
}
