"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminRegistration, RegistrationReviewState } from "@/app/actions/admin";
import { updateRegistrationStatus } from "@/app/actions/admin";
import { allAssignedScoresIn, DECISION_STATUSES } from "@/lib/admin-teams";
import { REGISTRATION_STATUS_LABELS, REGISTRATION_STATUS_BADGE_VARIANT } from "@/lib/registration-status";
import { cn } from "@/lib/utils";

const VARIANT_SELECT_CLASSES: Record<string, string> = {
  neutral: "border-ignite-ink/25 bg-ignite-lavender text-ignite-ink",
  warn: "border-ignite-warn/25 bg-ignite-warn-pale text-ignite-warn",
  success: "border-ignite-success/25 bg-ignite-success-pale text-ignite-success",
  danger: "border-ignite-danger/25 bg-ignite-danger-pale text-ignite-danger",
};

/**
 * Change a registration's status directly from a list row or card, without
 * navigating into the detail page. The select itself is the colored pill —
 * clicking it opens the native dropdown to change status. Stops click
 * propagation so it can sit inside a row/card that navigates on click
 * elsewhere.
 *
 * Sends the registration's version with the change; if another admin got
 * there first, the server refuses and returns the current state, which is
 * shown here in place of the stale one. Shortlisted/Rejected stay disabled
 * until every assigned judge has submitted a score.
 */
export function InlineStatusSelect({
  registration,
  onChange,
}: {
  registration: AdminRegistration;
  onChange: (next: RegistrationReviewState) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const status = registration.status;
  const canDecide = allAssignedScoresIn(registration);

  async function handleChange(next: string) {
    if (next === status) return;
    setBusy(true);
    const result = await updateRegistrationStatus(registration.id, next, registration.version);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      if (result.state) {
        onChange(result.state);
        router.refresh();
      }
      return;
    }
    onChange(result.state);
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
        "cursor-pointer appearance-none rounded-full border-[1.5px] px-3 py-1 font-ui text-[10px] font-bold uppercase tracking-[0.1em] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_SELECT_CLASSES[variant],
      )}
    >
      {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => {
        const blocked = !canDecide && value !== status && DECISION_STATUSES.includes(value as AdminRegistration["status"]);
        return (
          <option key={value} value={value} disabled={blocked}>
            {blocked ? `${label} (scores pending)` : label}
          </option>
        );
      })}
    </select>
  );
}
