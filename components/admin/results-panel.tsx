"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getResultsPublication,
  setResultsPublished,
  updateResultsMessages,
  type ResultsPublication,
} from "@/app/actions/results";
import { Badge, Field, FormCard, PrimaryButton, SecondaryButton, TextArea } from "@/components/admin/ui";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Admin-only (the dashboard renders this for admin-level roles; the server
 * actions and results_publication's RLS check again). Controls when teams
 * see their shortlisting result — on their status page and their ID-card QR
 * page — and the message shown with each outcome.
 */
export function ResultsPanel({ initial }: { initial: ResultsPublication }) {
  const [state, setState] = useState(initial);
  const [shortlistedMessage, setShortlistedMessage] = useState(initial.shortlistedMessage);
  const [notSelectedMessage, setNotSelectedMessage] = useState(initial.notSelectedMessage);
  const [savingMessages, setSavingMessages] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  const { counts } = state;
  const messagesChanged =
    shortlistedMessage.trim() !== state.shortlistedMessage || notSelectedMessage.trim() !== state.notSelectedMessage;

  async function reload() {
    const fresh = await getResultsPublication();
    if (fresh.success) setState(fresh.data);
  }

  async function handleSaveMessages() {
    setSavingMessages(true);
    const result = await updateResultsMessages({ shortlistedMessage, notSelectedMessage });
    setSavingMessages(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Messages saved.");
    await reload();
  }

  async function handleSwitch(publish: boolean) {
    setSwitching(true);
    const result = await setResultsPublished(publish);
    setSwitching(false);
    setConfirming(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(publish ? "Results published." : "Results hidden again.");
    await reload();
  }

  return (
    <FormCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-display text-[19px] font-bold text-ignite-ink">Results</h2>
        <Badge variant={state.isPublished ? "success" : "neutral"}>
          {state.isPublished
            ? `Published${state.publishedAt ? ` · ${new Date(state.publishedAt).toLocaleString()}` : ""}`
            : "Not published"}
        </Badge>
      </div>
      <p className="m-0 text-[13px] text-ignite-muted">
        Until results are published, teams see &ldquo;Under review&rdquo; even after a decision is made. Once
        published, each team sees its result and the matching message below on its status page and ID-card QR page
        (members must be signed in).
      </p>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <Badge variant="success">{counts.shortlisted} shortlisted</Badge>
        <Badge variant="danger">{counts.notSelected} not shortlisted</Badge>
        <Badge variant={counts.undecided > 0 ? "warn" : "neutral"}>{counts.undecided} undecided</Badge>
      </div>

      <Field label="Message for shortlisted teams" hint="For example next steps and event dates. Plain text.">
        <TextArea
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={shortlistedMessage}
          onChange={(e) => setShortlistedMessage(e.target.value)}
          placeholder="Congratulations! Your team has been shortlisted for the gIGNITE 2026 Grand Finale."
        />
      </Field>
      <Field label="Message for teams not shortlisted" hint="For example a thank-you note. Plain text.">
        <TextArea
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={notSelectedMessage}
          onChange={(e) => setNotSelectedMessage(e.target.value)}
          placeholder="Thank you for taking part in gIGNITE 2026. Your team wasn't shortlisted this time."
        />
      </Field>
      <div className="w-fit">
        <SecondaryButton type="button" onClick={handleSaveMessages} disabled={savingMessages || !messagesChanged}>
          {savingMessages ? "Saving…" : "Save messages"}
        </SecondaryButton>
      </div>

      {state.isPublished ? (
        <div className="flex flex-col gap-2 border-t border-ignite-edge/[0.07] pt-4">
          <p className="m-0 text-[13px] text-ignite-muted">
            Hiding results again takes them off every status page and QR page straight away.
          </p>
          <div className="w-fit">
            <SecondaryButton type="button" onClick={() => handleSwitch(false)} disabled={switching}>
              {switching ? "Hiding…" : "Un-publish results"}
            </SecondaryButton>
          </div>
        </div>
      ) : confirming ? (
        <div className="flex flex-col gap-3 rounded-xl bg-ignite-lavender px-4 py-3">
          <p className="m-0 text-[14px] font-semibold text-ignite-ink">
            Publish results to {counts.shortlisted + counts.notSelected} decided team
            {counts.shortlisted + counts.notSelected === 1 ? "" : "s"}?
          </p>
          {counts.undecided > 0 && (
            <p className="m-0 text-[13px] text-ignite-warn">
              {counts.undecided} team{counts.undecided === 1 ? " is" : "s are"} still undecided — they&apos;ll keep
              seeing &ldquo;Under review&rdquo; until a decision is made, then their result appears automatically.
            </p>
          )}
          {messagesChanged && (
            <p className="m-0 text-[13px] text-ignite-warn">You have unsaved message changes — save them first.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <div className="w-fit">
              <PrimaryButton type="button" onClick={() => handleSwitch(true)} disabled={switching} loading={switching}>
                {switching ? "Publishing…" : "Yes, publish results"}
              </PrimaryButton>
            </div>
            <div className="w-fit">
              <SecondaryButton type="button" onClick={() => setConfirming(false)} disabled={switching}>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-fit border-t border-ignite-edge/[0.07] pt-4">
          <PrimaryButton type="button" onClick={() => setConfirming(true)}>
            Publish results
          </PrimaryButton>
        </div>
      )}
    </FormCard>
  );
}
