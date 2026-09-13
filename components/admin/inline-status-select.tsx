"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateRegistrationStatus } from "@/app/actions/admin";
import { REGISTRATION_STATUS_LABELS, REGISTRATION_STATUS_BADGE_VARIANT } from "@/lib/registration-status";
import { cn } from "@/lib/utils";

const VARIANT_SELECT_CLASSES: Record<string, string> = {
  neutral: "border-gignite-blue/25 bg-gignite-blue-pale text-gignite-blue",
  warn: "border-gignite-warn/25 bg-gignite-warn-pale text-gignite-warn",
  success: "border-gignite-success/25 bg-gignite-success-pale text-gignite-success",
  danger: "border-gignite-danger/25 bg-gignite-danger-pale text-gignite-danger",
};

/**
 * Change a registration's status directly from a list row or card, without
 * navigating into the detail page. The select itself is the colored pill —
 * clicking it opens the native dropdown to change status. Stops click
 * propagation so it can sit inside a row/card that navigates on click
 * elsewhere.
 */
export function InlineStatusSelect({
  registrationId,
  status,
  onChange,
}: {
  registrationId: string;
  status: string;
  onChange: (next: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleChange(next: string) {
    if (next === status) return;
    setBusy(true);
    const result = await updateRegistrationStatus(registrationId, next);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChange(next);
    toast.success("Status updated.");
  }

  const variant = REGISTRATION_STATUS_BADGE_VARIANT[status] ?? "neutral";

  return (
    <select
      disabled={busy}
      value={status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => handleChange(e.target.value)}
      className={cn(
        "cursor-pointer appearance-none rounded-full border-[1.5px] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_SELECT_CLASSES[variant],
      )}
    >
      {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
