"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getTeamEmails, resendTeamEmail, type TeamEmail } from "@/app/actions/emails";
import type { EmailKind } from "@/lib/email/deliver";
import { Panel, SectionLabel } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const LABELS: Record<EmailKind, string> = {
  registration_received: "Registration + ID cards",
  ineligible: "Not eligible",
  result: "Result",
};

const STATUS: Record<TeamEmail["status"], { label: string; className: string }> = {
  sent: { label: "Sent", className: "text-ignite-success" },
  failed: { label: "Failed", className: "text-ignite-danger" },
  pending: { label: "Queued", className: "text-ignite-muted" },
  sending: { label: "Sending…", className: "text-ignite-muted" },
};

/** Admin: the emails sent to this team's leader, with Resend. */
export function TeamEmails({ teamId }: { teamId: string }) {
  const [emails, setEmails] = useState<TeamEmail[] | null>(null);
  const [busy, setBusy] = useState<EmailKind | null>(null);

  async function load() {
    const result = await getTeamEmails(teamId).catch(() => null);
    setEmails(result?.success ? result.emails : []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function resend(kind: EmailKind) {
    setBusy(kind);
    const result = await resendTeamEmail(teamId, kind).catch(() => ({ success: false as const, error: "No connection." }));
    setBusy(null);
    if (!result.success) toast.error(result.error);
    else if (result.status === "sent") toast.success("Email sent.");
    else toast.error("The email couldn't be sent — see the error below.");
    await load();
  }

  return (
    <Panel className="flex flex-col gap-2.5 p-5">
      <SectionLabel>Emails to leader</SectionLabel>
      {emails === null ? (
        <span className="text-[13px] text-ignite-muted">Loading…</span>
      ) : emails.length === 0 ? (
        <span className="text-[13px] leading-[1.5] text-ignite-muted">
          No emails yet. (Teams registered before emails were switched on didn&apos;t get one.)
        </span>
      ) : (
        emails.map((e) => (
          <div key={e.kind} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-ignite-ink-soft">{LABELS[e.kind]}</span>
              <span className={cn("text-[14px] font-semibold", STATUS[e.status].className)}>
                {STATUS[e.status].label}
                {e.sentAt && e.status === "sent" && (
                  <span className="font-normal text-ignite-muted">
                    {" "}
                    · {new Date(e.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
              </span>
            </div>
            {e.status === "failed" && e.lastError && (
              <span className="break-words text-[12px] text-ignite-danger">{e.lastError}</span>
            )}
            {e.status !== "sending" && (
              <button
                type="button"
                onClick={() => resend(e.kind)}
                disabled={busy !== null}
                className="w-fit text-[13px] font-semibold text-ignite-ink underline-offset-2 hover:underline disabled:opacity-50"
              >
                {busy === e.kind ? "Sending…" : e.status === "failed" ? "Retry" : "Resend"}
              </button>
            )}
          </div>
        ))
      )}
      {emails !== null && !emails.some((e) => e.kind === "registration_received") && (
        <button
          type="button"
          onClick={() => resend("registration_received")}
          disabled={busy !== null}
          className="w-fit text-[13px] font-semibold text-ignite-ink underline-offset-2 hover:underline disabled:opacity-50"
        >
          {busy === "registration_received" ? "Sending…" : "Send registration email + ID cards"}
        </button>
      )}
    </Panel>
  );
}
