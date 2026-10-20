"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminRegistration, VerificationStatus } from "@/app/actions/admin";
import { Badge, Panel, SectionLabel, TextArea } from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { correctionDeadline, correctionEmail, ineligibleEmail } from "@/lib/email/templates";
import {
  VERIFICATION_STATUS_BADGE_VARIANT,
  VERIFICATION_STATUS_HINTS,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/registration-status";
import { cn } from "@/lib/utils";

/** The fields the panel reads — an AdminRegistration has them all. */
type VerifiableRegistration = Pick<
  AdminRegistration,
  | "id"
  | "version"
  | "verification_status"
  | "verification_note"
  | "verification_decided_at"
  | "verification_decided_by_name"
>;

type SaveResult<S> = { success: true; state: S } | { success: false; error: string; state?: S };

/** The two outcomes that email the team leader the note. */
type EmailedStatus = "needs_correction" | "ineligible";

const DRAFT: Record<EmailedStatus, { placeholder: string; title: string; confirm: string; toast: string }> = {
  needs_correction: {
    placeholder:
      "What needs correcting, e.g. Member 2's ID card is unreadable — please send a clear photo. This is emailed to the team leader.",
    title: "Send a correction request?",
    confirm: "Send correction request",
    toast: "Correction requested. The email is on its way to the team leader.",
  },
  ineligible: {
    placeholder:
      "Reason, e.g. No corrected details received by the deadline. This is emailed to the team leader.",
    title: "Mark ineligible and send the final notice?",
    confirm: "Mark ineligible & send",
    toast: "Marked ineligible. The final notice is on its way to the team leader.",
  },
};

/**
 * Eligibility check that gates judge assignment, used by admins (team
 * detail) and volunteers (volunteer team detail): check the members' ID
 * cards, details and deck, then mark the entry Verified, or request a
 * correction with a note saying what's wrong. Only admins can mark a team
 * Ineligible — the final call, usually once a correction request's deadline
 * has passed (also enforced server-side). Both of those email the note to
 * the team leader, so they go through a pop-up showing the exact email
 * before anything is saved. Changing a Verified entry is refused
 * server-side while judges are still assigned, so that's surfaced up front
 * here. A change made from a stale view (someone else changed this
 * registration first) is refused and the latest is shown. `save` is the
 * role's server action (setVerificationStatus for admins,
 * setTeamVerification for volunteers); `onChange` receives its state.
 */
export function VerificationPanel<S>({
  registration,
  teamName,
  entryCode,
  leader,
  canMarkIneligible,
  assignedJudgeCount,
  save,
  onChange,
}: {
  registration: VerifiableRegistration;
  teamName: string;
  entryCode: string;
  /** Who the emails go to, for the review pop-up. */
  leader: { name: string; email: string } | null;
  /** Admins only. */
  canMarkIneligible: boolean;
  assignedJudgeCount: number;
  save: (registrationId: string, status: VerificationStatus, expectedVersion: number, note?: string) => Promise<SaveResult<S>>;
  onChange: (next: S) => void;
}) {
  const router = useRouter();
  const verification = {
    status: registration.verification_status,
    note: registration.verification_note,
    decidedAt: registration.verification_decided_at,
    decidedByName: registration.verification_decided_by_name,
  };
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState<EmailedStatus | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  function closeDraft() {
    setDrafting(null);
    setConfirming(false);
    setNote("");
  }

  async function submit(status: VerificationStatus, text?: string) {
    setBusy(true);
    const result = await save(registration.id, status, registration.version, text);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      if (result.state) {
        onChange(result.state);
        closeDraft();
        router.refresh();
      }
      return;
    }
    onChange(result.state);
    closeDraft();
    toast.success(
      status === "pending"
        ? "Verification reset."
        : status === "needs_correction" || status === "ineligible"
          ? DRAFT[status].toast
          : `Marked ${VERIFICATION_STATUS_LABELS[status].toLowerCase()}.`,
    );
  }

  const lockedByAssignments = verification.status === "verified" && assignedJudgeCount > 0;
  const decidedLabel = verification.decidedAt
    ? new Date(verification.decidedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const deadline =
    verification.status === "needs_correction" && verification.decidedAt
      ? correctionDeadline(verification.decidedAt)
      : null;
  const overdue = deadline !== null && deadline.date.getTime() < Date.now();

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Eligibility verification</SectionLabel>
        <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-orange">Staff only</span>
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
              By {verification.decidedByName ?? "a staff member"} · {decidedLabel}
            </span>
          )}
          {verification.note && (
            <span className="whitespace-pre-wrap break-words text-ignite-ink-soft">{verification.note}</span>
          )}
          {deadline && (
            <span className={cn("font-semibold", overdue ? "text-ignite-danger" : "text-ignite-ink")}>
              {overdue
                ? `Deadline passed (${deadline.label}).${canMarkIneligible ? " If nothing came in, you can mark the team ineligible." : ""}`
                : `Reply due by ${deadline.label}.`}
            </span>
          )}
        </div>
      )}

      {lockedByAssignments ? (
        <span className="text-[13px] leading-[1.5] text-ignite-muted">
          Unassign all judges to change this entry&apos;s verification.
        </span>
      ) : drafting ? (
        <div className="flex flex-col gap-2.5">
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={DRAFT[drafting].placeholder}
            rows={3}
            maxLength={1000}
            autoFocus
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy || !note.trim()}
              className={cn(
                "flex-1 rounded-[9px] px-4 py-2.5 font-display text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                drafting === "ineligible" ? "bg-ignite-danger hover:bg-ignite-danger/85" : "bg-ignite-primary hover:bg-ignite-primary-hover",
              )}
            >
              Review email…
            </button>
            <button
              type="button"
              onClick={closeDraft}
              disabled={busy}
              className="flex-1 rounded-[9px] border-[1.5px] border-ignite-edge/[0.18] bg-ignite-surface px-4 py-2.5 font-display text-[14px] font-medium text-ignite-ink-soft transition-colors hover:border-ignite-ink hover:text-ignite-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2.5">
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
            {verification.status !== "needs_correction" && verification.status !== "ineligible" && (
              <button
                type="button"
                onClick={() => setDrafting("needs_correction")}
                disabled={busy}
                className="flex-1 rounded-[9px] border-[1.5px] border-ignite-ink/70 px-4 py-2.5 font-display text-[14px] font-medium text-ignite-ink transition-colors hover:bg-ignite-lavender disabled:cursor-not-allowed disabled:opacity-50"
              >
                Request correction
              </button>
            )}
          </div>
          {canMarkIneligible && verification.status !== "ineligible" && (
            <button
              type="button"
              onClick={() => setDrafting("ineligible")}
              disabled={busy}
              className="rounded-[9px] border-[1.5px] border-ignite-danger px-4 py-2.5 font-display text-[14px] font-medium text-ignite-danger transition-colors hover:bg-ignite-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark ineligible (final)
            </button>
          )}
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

      {drafting && confirming && (
        <ConfirmDialog
          title={DRAFT[drafting].title}
          confirmLabel={DRAFT[drafting].confirm}
          busyLabel="Sending…"
          warning="The email is sent as soon as you confirm, so check what you wrote carefully."
          wide
          busy={busy}
          onConfirm={() => submit(drafting, note)}
          onCancel={() => setConfirming(false)}
        >
          <EmailPreview kind={drafting} teamName={teamName} entryCode={entryCode} leader={leader} note={note} />
        </ConfirmDialog>
      )}
    </Panel>
  );
}

/** The email exactly as the leader will get it (plain-text version). */
function EmailPreview({
  kind,
  teamName,
  entryCode,
  leader,
  note,
}: {
  kind: EmailedStatus;
  teamName: string;
  entryCode: string;
  leader: { name: string; email: string } | null;
  note: string;
}) {
  const common = {
    site: typeof window === "undefined" ? "" : window.location.origin,
    to: leader?.email ?? "",
    leaderName: leader ? leader.name.split(" ")[0] || leader.name : "there",
    teamName,
    statusUrl: "(link to their registration status page)",
  };
  const email =
    kind === "needs_correction"
      ? correctionEmail({ ...common, entryCode, note })
      : ineligibleEmail({ ...common, reason: note });
  return (
    <>
      <div className="flex flex-col gap-0.5 text-[13px]">
        <span>
          <span className="font-semibold text-ignite-ink">To:</span>{" "}
          {leader ? `${leader.name} <${leader.email}>` : "the team leader"}
        </span>
        <span>
          <span className="font-semibold text-ignite-ink">Subject:</span> {email.subject}
        </span>
      </div>
      <pre className="m-0 max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border border-ignite-edge/[0.1] bg-ignite-bg p-3 font-ui text-[13px] leading-[1.5] text-ignite-ink-soft">
        {email.text}
      </pre>
    </>
  );
}
