"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { VerificationStatus } from "@/app/actions/admin";
import { setVerificationStatus } from "@/app/actions/admin";
import { Badge, Panel, SectionLabel, TextArea } from "@/components/admin/ui";
import {
  VERIFICATION_STATUS_BADGE_VARIANT,
  VERIFICATION_STATUS_HINTS,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/registration-status";

export type VerificationState = {
  status: VerificationStatus;
  note: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
};

/**
 * Admin-only eligibility check that gates judge assignment: the admin checks
 * the members' ID cards (IdCardPanel) and details, then marks the entry
 * Verified or Ineligible. Ineligible needs a written reason. Changing a
 * Verified entry is refused server-side while judges are still assigned, so
 * that's surfaced up front here instead of only as an error toast.
 */
export function VerificationPanel({
  registrationId,
  verification,
  assignedCount,
  onChange,
}: {
  registrationId: string;
  verification: VerificationState;
  assignedCount: number;
  onChange: (next: VerificationState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function submit(status: VerificationStatus, note?: string) {
    setBusy(true);
    const result = await setVerificationStatus(registrationId, status, note);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChange(result.verification);
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
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-accent">Admin only</span>
      </div>

      <div>
        <Badge variant={VERIFICATION_STATUS_BADGE_VARIANT[verification.status] ?? "neutral"}>
          {VERIFICATION_STATUS_LABELS[verification.status] ?? verification.status}
        </Badge>
      </div>
      <span className="text-[13px] leading-[1.5] text-gignite-text/75">
        {VERIFICATION_STATUS_HINTS[verification.status]}
      </span>

      {verification.status !== "pending" && (decidedLabel || verification.note) && (
        <div className="flex flex-col gap-1 rounded-[10px] border border-gignite-divider bg-gignite-card p-3 text-[13px] leading-[1.5]">
          {decidedLabel && (
            <span className="text-gignite-text/70">
              By {verification.decidedByName ?? "an admin"} · {decidedLabel}
            </span>
          )}
          {verification.note && (
            <span className="whitespace-pre-wrap break-words text-gignite-text">{verification.note}</span>
          )}
        </div>
      )}

      {lockedByAssignments ? (
        <span className="text-[13px] leading-[1.5] text-gignite-text/75">
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
              className="flex-1 rounded-[9px] bg-gignite-danger px-4 py-2.5 font-heading text-[14px] font-medium text-white transition-colors hover:bg-[#98300F] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex-1 rounded-[9px] border-[1.5px] border-gignite-border-strong bg-white px-4 py-2.5 font-heading text-[14px] font-medium text-gignite-text transition-colors hover:border-gignite-blue hover:text-gignite-blue"
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
                className="flex-1 rounded-[9px] bg-gignite-blue px-4 py-2.5 font-heading text-[14px] font-medium text-white transition-colors hover:bg-gignite-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Saving…" : "Mark verified"}
              </button>
            )}
            {verification.status !== "ineligible" && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="flex-1 rounded-[9px] border-[1.5px] border-gignite-danger px-4 py-2.5 font-heading text-[14px] font-medium text-gignite-danger transition-colors hover:bg-gignite-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
              className="self-start text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent disabled:opacity-50"
            >
              Reset to pending
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
