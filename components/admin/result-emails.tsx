"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getResultEmailProgress,
  sendNextResultEmails,
  startResultEmails,
  type ResultEmailProgress,
} from "@/app/actions/results";
import { PrimaryButton, SecondaryButton } from "@/components/admin/ui";

/**
 * "Send result emails" on the Results panel, shown once results are
 * published. Queues one email per decided team's leader, then asks the
 * server for small batches until the queue is empty, showing progress.
 * Safe to close the page and come back: sending resumes from the queue, and
 * no team is ever emailed twice.
 */
export function ResultEmails({ decidedTeams, messagesUnsaved }: { decidedTeams: number; messagesUnsaved: boolean }) {
  const [progress, setProgress] = useState<ResultEmailProgress | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    getResultEmailProgress().then((r) => r.success && setProgress(r.progress));
    return () => {
      stopRef.current = true;
    };
  }, []);

  async function run() {
    setConfirming(false);
    setSending(true);
    stopRef.current = false;
    let result = await startResultEmails().catch(() => ({ success: false as const, error: "No connection." }));
    while (result.success && result.progress.pending > 0 && !stopRef.current) {
      const before = result.progress;
      setProgress(before);
      result = await sendNextResultEmails().catch(() => ({
        success: false as const,
        error: "Lost connection — click Send again to carry on where it stopped.",
      }));
      // Nothing moved: the rest are being sent from another tab, or stuck
      // mid-send (they become retryable after 10 minutes).
      if (result.success && result.progress.pending === before.pending && result.progress.sent === before.sent) {
        toast.info("Some emails are still being sent elsewhere — check back in a few minutes.");
        break;
      }
    }
    setSending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setProgress(result.progress);
    if (stopRef.current) return;
    if (result.progress.failed > 0) {
      toast.error(`${result.progress.failed} email${result.progress.failed === 1 ? "" : "s"} failed — click Retry to send them again.`);
    } else {
      toast.success("All result emails sent.");
    }
  }

  const done = progress ? progress.sent : 0;
  const total = progress ? progress.total : 0;
  const notQueued = Math.max(0, decidedTeams - total);
  const nothingToSend = progress !== null && notQueued === 0 && progress.pending === 0 && progress.failed === 0;
  const label = progress?.failed ? "Retry failed emails" : total > 0 && notQueued === 0 ? "Resume sending" : "Send result emails";

  return (
    <div className="flex flex-col gap-2 border-t border-ignite-edge/[0.07] pt-4">
      <span className="font-ui text-[14px] font-semibold text-ignite-ink">Result emails</span>
      <p className="m-0 text-[13px] text-ignite-muted">
        Emails each decided team&apos;s leader their result with the message above. Teams that already got one are
        skipped, so it&apos;s safe to click again — for example after deciding more teams.
      </p>

      {progress && total > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ignite-lavender">
            <div
              className="h-full rounded-full bg-ignite-success transition-[width]"
              style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
            />
          </div>
          <span className="font-ui text-[13px] text-ignite-ink-soft">
            {done} / {total} sent
            {progress.failed > 0 && <span className="text-ignite-danger"> · {progress.failed} failed</span>}
            {notQueued > 0 && ` · ${notQueued} newly decided not emailed yet`}
          </span>
        </div>
      )}

      {sending ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-ui text-[13px] font-semibold text-ignite-ink">Sending… keep this page open.</span>
          <SecondaryButton type="button" onClick={() => (stopRef.current = true)}>
            Pause
          </SecondaryButton>
        </div>
      ) : confirming ? (
        <div className="flex flex-col gap-3 rounded-xl bg-ignite-lavender px-4 py-3">
          <p className="m-0 text-[14px] font-semibold text-ignite-ink">
            Email {notQueued + (progress?.pending ?? 0) + (progress?.failed ?? 0)} team leader
            {notQueued + (progress?.pending ?? 0) + (progress?.failed ?? 0) === 1 ? "" : "s"} their result now?
          </p>
          {messagesUnsaved && (
            <p className="m-0 text-[13px] text-ignite-warn">You have unsaved message changes — save them first.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <div className="w-fit">
              <PrimaryButton type="button" onClick={run} disabled={messagesUnsaved}>
                Yes, send emails
              </PrimaryButton>
            </div>
            <SecondaryButton type="button" onClick={() => setConfirming(false)}>
              Cancel
            </SecondaryButton>
          </div>
        </div>
      ) : nothingToSend ? (
        <span className="font-ui text-[13px] text-ignite-success">
          {total > 0 ? "Every decided team has been emailed." : "No decided teams to email yet."}
        </span>
      ) : (
        <div className="w-fit">
          <PrimaryButton type="button" onClick={() => setConfirming(true)} disabled={progress === null}>
            {label}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
