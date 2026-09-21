"use server";

import { createClient } from "@/lib/supabase/server";
import { getCallerRole } from "./admin";
import { isAdminLevelRole } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit-log";
import type { RegistrationWindow } from "@/lib/registration-window";

export type { RegistrationWindow } from "@/lib/registration-window";

const DEFAULT_WINDOW: RegistrationWindow = { isOpen: true, closesAt: null, closedMessage: null };

/**
 * Whether registration is currently open, per registration_window's single
 * row. Public — readable by anyone, signed in or not, since /register needs
 * to know before even offering sign-in. Fails open (returns the default —
 * open, no closing date) on any read error, same reasoning as every other
 * "don't let a transient DB hiccup lock out real users" catch in this file.
 */
export async function getRegistrationWindow(): Promise<RegistrationWindow> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("registration_window")
      .select("is_open, closes_at, closed_message")
      .eq("id", true)
      .single();
    if (error || !data) return DEFAULT_WINDOW;
    return {
      isOpen: data.is_open,
      closesAt: data.closes_at,
      closedMessage: data.closed_message,
    };
  } catch (err) {
    console.error("getRegistrationWindow threw unexpectedly:", err);
    return DEFAULT_WINDOW;
  }
}

type UpdateResult = { success: true } | { success: false; error: string };

/** Admin (or super-admin) only: open/close registration and set/clear a closing date + message. */
export async function updateRegistrationWindow(input: {
  isOpen: boolean;
  closesAt: string | null;
  closedMessage: string | null;
}): Promise<UpdateResult> {
  const caller = await getCallerRole();
  if (!caller) {
    return { success: false, error: "Please sign in." };
  }
  if (!isAdminLevelRole(caller.role)) {
    return { success: false, error: "Only admins can change the registration window." };
  }

  const supabase = await createClient();
  // RLS's registration_window_update_admin policy enforces is_admin() again
  // at the DB level regardless — the check above is just for a clean error.
  const { error } = await supabase
    .from("registration_window")
    .update({
      is_open: input.isOpen,
      closes_at: input.closesAt,
      closed_message: input.closedMessage,
      updated_by: caller.userId,
    })
    .eq("id", true);

  if (error) {
    return { success: false, error: "Could not update the registration window." };
  }
  await logAuditEvent(supabase, "registration_window.updated", {
    metadata: { isOpen: input.isOpen, closesAt: input.closesAt },
  });
  return { success: true };
}
