"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminRegistration, RegistrationReviewState, VerificationStatus } from "@/app/actions/admin";
import { setVerificationStatus } from "@/app/actions/admin";
import { Badge, Panel, SectionLabel, TextArea } from "@/components/admin/ui";
import {
  VERIFICATION_STATUS_BADGE_VARIANT,
  VERIFICATION_STATUS_HINTS,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/registration-status";

/**
 * Admin-only eligibility check that gates judge assignment: the admin checks
 * the members' ID cards (IdCardPanel) and details, then marks the entry
 * Verified or Ineligible. Ineligible needs a written reason. Changing a
 * Verified entry is refused server-side while judges are still assigned, so
 * that's surfaced up front here instead of only as an error toast.
 * Like the status select, a change made from a stale view (another admin
 * changed this registration first) is refused and the latest is shown.
 */
export function VerificationPanel({
  registration,
  onChange,
}: {
  registration: AdminRegistration;
  onChange: (next: RegistrationReviewState) => void;
}) {
  const router = useRouter();
  const verification = {
    status: registration.verification_status,
    note: registration.verification_note,
    decidedAt: registration.verification_decided_at,
    decidedByName: registration.verification_decided_by_name,
  };
  const assignedCount = registration.assignments.length;
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function submit(status: VerificationStatus, note?: string) {
    setBusy(true);
    const result = await setVerificationStatus(registration.id, status, registration.version, note);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      if (result.state) {
        onChange(result.state);
        setRejecting(false);
        router.refresh();
      }
      return;
    }
    onChange(result.state);
    setRejecting(false);
    setReason("");
    toast.success(status === "pending" ? "Verification reset." : `Marked ${VERIFICATION_STATUS_LABELS[status].toLowerCase()}.`);
  }

  const lockedByAssignments = verification.status === "verified" && assignedCount > 0;
  const decidedLabel = verification.decidedAt
    ? new Date(verification.decidedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Eligibility verification</SectionLabel>
        <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-orange">Admin only</span>
      </div>

      <div>
        <Badge variant={VERIFICATION_STATUS_BADGE_VARIANT[verification.status] ?? "neutral"}>
          {VERIFICATION_STATUS_LABELS[verification.status] ?? verification.status}
        </Badge>
      </div>
      <span className="text-[13px] leading-[1.5] text-ignite-muted">
        {VERIFICATION_STATUS_HINTS[verification.status]}
      </span>

      {verification.status !== "pending" && (decidedLabel || verification.note) && (
        <div className="flex flex-col gap-1 rounded-[10px] border border-ignite-edge/[0.07] bg-ignite-bg p-3 text-[13px] leading-[1.5]">
          {decidedLabel && (
            <span className="text-ignite-muted">
              By {verification.decidedByName ?? "an admin"} · {decidedLabel}
            </span>
          )}
          {verification.note && (
            <span className="whitespace-pre-wrap break-words text-ignite-ink-soft">{verification.note}</span>
          )}
        </div>
      )}

      {lockedByAssignments ? (
        <span className="text-[13px] leading-[1.5] text-ignite-muted">
          Unassign all judges to change this entry&apos;s verification.
        </span>
      ) : rejecting ? (
        <div className="flex flex-col gap-2.5">
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason, e.g. ID card doesn't match the member's name or college"
            rows={3}
            maxLength={1000}
            autoFocus
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => submit("ineligible", reason)}
              disabled={busy || !reason.trim()}
              className="flex-1 rounded-[9px] bg-ignite-danger px-4 py-2.5 font-display text-[14px] font-medium text-white transition-colors hover:bg-ignite-danger/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Mark ineligible"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              disabled={busy}
              className="flex-1 rounded-[9px] border-[1.5px] border-ignite-edge/[0.18] bg-ignite-surface px-4 py-2.5 font-display text-[14px] font-medium text-ignite-ink-soft transition-colors hover:border-ignite-ink hover:text-ignite-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2.5">
            {verification.status !== "verified" && (
              <button
                type="button"
                onClick={() => submit("verified")}
                disabled={busy}
                className="flex-1 rounded-[9px] bg-ignite-primary px-4 py-2.5 font-display text-[14px] font-medium text-ignite-on-primary transition-colors hover:bg-ignite-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Saving…" : "Mark verified"}
              </button>
            )}
            {verification.status !== "ineligible" && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="flex-1 rounded-[9px] border-[1.5px] border-ignite-danger px-4 py-2.5 font-display text-[14px] font-medium text-ignite-danger transition-colors hover:bg-ignite-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark ineligible
              </button>
            )}
          </div>
          {verification.status !== "pending" && (
            <button
              type="button"
              onClick={() => submit("pending")}
              disabled={busy}
              className="self-start text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta disabled:opacity-50"
            >
              Reset to pending
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
