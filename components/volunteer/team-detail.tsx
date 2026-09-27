"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getVerificationIdCardUrl,
  setTeamVerification,
  type VerificationMember,
  type VerificationState,
  type VerificationTeamDetail,
} from "@/app/actions/verification";
import { VerificationPanel } from "@/components/admin/verification-panel";
import { useLiveRefresh } from "@/components/admin/use-live-refresh";
import { Panel, SectionLabel, Spinner } from "@/components/admin/ui";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/**
 * Volunteer team page: team + member details and each member's ID card,
 * then the same verification panel admins use. Only the fields from
 * getVerificationTeam reach this page — never the idea or deck.
 */
export function VolunteerTeamDetail({ detail }: { detail: VerificationTeamDetail }) {
  const [state, setState] = useState<VerificationState>(detail.state);
  // A live refresh (another volunteer/admin acting) arrives as new props.
  useEffect(() => setState(detail.state), [detail.state]);
  useLiveRefresh();

  const { team, members } = detail;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Link href="/dashboard" className="w-fit text-[13px] font-semibold text-ignite-muted hover:text-ignite-ink">
          ← All teams
        </Link>
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-ignite-ink">{team.name}</h1>
        <p className="m-0 text-[14px] text-ignite-muted">
          <span className="font-semibold tracking-[0.04em] text-ignite-ink-soft">{team.entryCode}</span> · {team.district} ·
          Submitted {formatDate(team.createdAt)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <Panel className="flex flex-col gap-4 p-5">
          <SectionLabel>Members &amp; ID cards</SectionLabel>
          {members.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </Panel>

        <VerificationPanel
          registration={{
            id: detail.registrationId,
            version: state.version,
            verification_status: state.verification.status,
            verification_note: state.verification.note,
            verification_decided_at: state.verification.decidedAt,
            verification_decided_by_name: state.verification.decidedByName,
          }}
          assignedJudgeCount={detail.assignedJudgeCount}
          save={setTeamVerification}
          onChange={setState}
        />
      </div>
    </div>
  );
}

function MemberRow({ member: m }: { member: VerificationMember }) {
  return (
    <div className="flex flex-col gap-3 border-t border-ignite-edge/[0.07] pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start">
      <IdCardThumb member={m} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[15px] font-semibold text-ignite-ink">{m.fullName}</span>
          {m.isLeader && (
            <span className="rounded-full bg-ignite-primary px-2 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-ignite-on-primary">
              Leader
            </span>
          )}
          <span className="text-[12px] font-bold tracking-[0.04em] text-ignite-muted">{m.memberCode}</span>
        </div>
        <span className="text-ignite-ink-soft">{m.college}</span>
        <span className="text-ignite-muted">
          {[m.branch, m.year, m.roleInTeam].filter(Boolean).join(" · ") || "—"}
        </span>
        <span className="break-all text-ignite-muted">
          <a href={`mailto:${m.email}`} className="hover:text-ignite-ink">
            {m.email}
          </a>
          {" · "}
          <a href={`tel:${m.phone}`} className="hover:text-ignite-ink">
            {m.phone}
          </a>
        </span>
      </div>
    </div>
  );
}

type CardState = { status: "idle" } | { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

/** Loads the member's ID card as a thumbnail; click to view it full size. */
function IdCardThumb({ member }: { member: VerificationMember }) {
  const [card, setCard] = useState<CardState>({ status: "idle" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!member.hasIdCard) return;
    let cancelled = false;
    setCard({ status: "loading" });
    getVerificationIdCardUrl(member.id).then((result) => {
      if (cancelled) return;
      setCard(result.success ? { status: "ready", url: result.url } : { status: "error", message: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [member.id, member.hasIdCard]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const box = "flex h-[92px] w-[140px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-ignite-edge/[0.12] bg-ignite-bg text-center text-[12px] text-ignite-muted";

  if (!member.hasIdCard) return <div className={box}>No ID card uploaded</div>;
  if (card.status === "error") return <div className={box}>{card.message}</div>;
  if (card.status !== "ready") {
    return (
      <div className={box}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className={`${box} cursor-zoom-in p-0 hover:border-ignite-ink`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable remote asset */}
        <img src={card.url} alt={`${member.fullName}'s ID card`} className="h-full w-full object-cover" />
      </button>
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${member.fullName}'s ID card`}
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
          <img
            src={card.url}
            alt={`${member.fullName}'s ID card, full size`}
            className="max-h-full max-w-full rounded-[10px] object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-ignite-surface text-[16px] font-semibold text-ignite-ink"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
