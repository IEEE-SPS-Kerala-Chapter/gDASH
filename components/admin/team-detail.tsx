"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminTeam, AdminJudge, AdminRegistration, AdminMember } from "@/app/actions/admin";
import { updateRegistrationStatus } from "@/app/actions/admin";
import { InlineJudgeAssign } from "./inline-judge-assign";
import { DeckPanel } from "./deck-panel";
import { IdCardPanel } from "./id-card-panel";
import { JudgeScoresSummary } from "./judge-scores-summary";
import { ScoreForm } from "@/components/judge/score-form";
import { Badge, Panel, Select, SectionLabel, StatusDotBadge } from "@/components/admin/ui";
import {
  REGISTRATION_STATUS_HINTS,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUS_PILL,
} from "@/lib/registration-status";
import { teamDisplayCode } from "@/lib/team-code";
import { cn } from "@/lib/utils";

/** Per the Claude Design file "gIGNITE Team Detail Page.dc.html" — full
 * page replacing the old centered single-column layout: a two-column admin
 * view (submission content + status/judges/record rail), single-column for
 * a judge (who only sees their own scoring, not the admin-only controls). */
export function TeamDetail({
  team: initialTeam,
  judges,
  viewerRole,
  queueNav,
}: {
  team: AdminTeam;
  judges: AdminJudge[];
  viewerRole: string;
  /** Judge-only: prev/next through their assigned-teams queue, in the same order as their dashboard. */
  queueNav?: { prevTeamId: string | null; nextTeamId: string | null; position: string } | null;
}) {
  const [team, setTeam] = useState(initialTeam);
  const router = useRouter();
  const reg = team.registration;
  const leader = team.members.find((m) => m.is_leader);
  const isAdmin = viewerRole === "admin";
  const isJudge = viewerRole === "judge";

  async function handleStatusChange(status: string) {
    if (!reg) return;
    const result = await updateRegistrationStatus(reg.id, status);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTeam((prev) =>
      prev.registration
        ? { ...prev, registration: { ...prev.registration, status: status as typeof prev.registration.status } }
        : prev,
    );
    toast.success("Status updated.");
  }

  const teamCode = teamDisplayCode(team.id);
  const submittedLabel = reg
    ? new Date(reg.created_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const pill = reg ? (REGISTRATION_STATUS_PILL[reg.status] ?? REGISTRATION_STATUS_PILL.submitted) : null;

  const declarationsAllConfirmed =
    reg?.declaration_eligibility && reg?.declaration_originality && reg?.declaration_rules && reg?.declaration_media_consent;

  const contentSections = (
    <>
      {reg?.deck_path && <DeckPanel deckPath={reg.deck_path} uploadedAt={reg.created_at} />}
      {reg && isAdmin && (
        <JudgeScoresSummary scores={reg.scores} avgScore={reg.avgScore} assignedCount={reg.assignments.length} />
      )}
      {isAdmin && <IdCardPanel teamId={team.id} members={team.members} />}
      <MembersPanel members={team.members} />
      {reg && <SubmissionPanel reg={reg} />}
      {reg && isJudge && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Your evaluation</SectionLabel>
          <ScoreForm registrationId={reg.id} existingScore={reg.scores[0]} />
        </section>
      )}
      {isJudge && queueNav && (
        <div className="flex items-center justify-between gap-4 border-t border-gignite-divider pt-5">
          <button
            type="button"
            disabled={!queueNav.prevTeamId}
            onClick={() => queueNav.prevTeamId && router.push(`/dashboard/teams/${queueNav.prevTeamId}`)}
            className="font-body text-[15px] font-semibold text-gignite-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:text-gignite-blue"
          >
            ← Previous
          </button>
          <span className="font-mono text-[12px] text-gignite-text/60">{queueNav.position}</span>
          <button
            type="button"
            disabled={!queueNav.nextTeamId}
            onClick={() => queueNav.nextTeamId && router.push(`/dashboard/teams/${queueNav.nextTeamId}`)}
            className="font-body text-[15px] font-semibold text-gignite-blue transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:text-gignite-accent"
          >
            Next submission →
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gignite-divider pb-4">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href="/dashboard" className="text-gignite-text/70 hover:text-gignite-blue">
            Teams
          </Link>
          <span className="text-gignite-text/40">/</span>
          <span className="font-semibold text-black">{team.name}</span>
        </div>
        {leader && (
          <a
            href={`mailto:${leader.email}`}
            className="rounded-[9px] border-[1.5px] border-gignite-blue px-4 py-2 font-heading text-[14px] font-medium text-gignite-blue transition-colors hover:bg-gignite-blue hover:text-white"
          >
            Message team
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-8 border-b border-gignite-divider pb-6">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gignite-blue">
            Stage 1 entry · {teamCode}
          </span>
          <h1 className="m-0 font-heading text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-black lg:text-[40px]">
            {team.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex rounded-[6px] bg-gignite-blue-pale px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-gignite-blue">
              {team.ai_theme}
            </span>
            <span className="text-[15px] text-gignite-text">
              {team.district}
              {leader?.college ? ` · ${leader.college}` : ""}
            </span>
          </div>
        </div>
        {reg && pill && (
          <div className="flex flex-none flex-col items-end gap-2.5">
            <StatusDotBadge
              label={REGISTRATION_STATUS_LABELS[reg.status] ?? reg.status}
              bg={pill.bg}
              fg={pill.fg}
              dot={pill.dot}
            />
            <span className="font-mono text-[12px] text-gignite-text/70">Submitted {submittedLabel}</span>
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">{contentSections}</div>

          <div className="flex flex-col gap-5">
            {reg && (
              <Panel className="flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>Registration status</SectionLabel>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-accent">Admin only</span>
                </div>
                <Select
                  value={reg.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="border-gignite-blue font-semibold text-gignite-blue"
                >
                  {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <span className="text-[13px] leading-[1.5] text-gignite-text/75">
                  {REGISTRATION_STATUS_HINTS[reg.status]}
                </span>
              </Panel>
            )}

            {reg && (
              <Panel className="flex flex-col gap-3.5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>Assigned judges</SectionLabel>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-accent">Admin only</span>
                </div>
                <InlineJudgeAssign
                  registrationId={reg.id}
                  assignments={reg.assignments}
                  judges={judges}
                  scoredJudgeIds={reg.scores.map((s) => s.judgeId)}
                  onChange={(assignments) =>
                    setTeam((prev) => (prev.registration ? { ...prev, registration: { ...prev.registration, assignments } } : prev))
                  }
                />
                {judges.length === 0 && (
                  <span className="text-[13px] leading-[1.5] text-gignite-text/75">No judge accounts yet.</span>
                )}
              </Panel>
            )}

            <Panel className="flex flex-col gap-2.5 bg-gignite-card p-5">
              <SectionLabel>Record</SectionLabel>
              <RecordRow label="Entry ID" value={teamCode} mono />
              <RecordRow label="Submitted" value={submittedLabel ?? "—"} />
              <RecordRow label="Members" value={`${team.members.length} of 5`} />
              <RecordRow label="Deck" value={reg?.deck_path ? "Uploaded" : "Not uploaded"} />
              {reg && (
                <RecordRow
                  label="Declarations"
                  value={declarationsAllConfirmed ? "All confirmed" : "Required confirmed"}
                  valueClassName="text-[#146443]"
                />
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">{contentSections}</div>
      )}

      {!leader && <p className="text-[14px] text-gignite-text/60">No leader on record for this team.</p>}
    </div>
  );
}

function MembersPanel({ members }: { members: AdminMember[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex items-center justify-between gap-4">
        <h3 className="m-0 font-heading text-[22px] font-medium tracking-[-0.01em] text-black">Members</h3>
        <span className="font-mono text-[12px] text-gignite-text/70">{members.length} of 5</span>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {members.map((m) => (
          <div key={m.id} className="flex gap-3.5 rounded-[10px] border border-[#EFE4CB] bg-gignite-card p-4">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gignite-blue-pale font-heading text-[14px] font-bold text-gignite-blue">
              {initials(m.full_name)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-black">{m.full_name}</span>
                {m.is_leader && <Badge className="text-[9px]">Leader</Badge>}
              </div>
              <span className="truncate text-[13px] text-gignite-text">{m.email}</span>
              <span className="text-[13px] text-gignite-text/80">{m.phone}</span>
              <span className="text-[13px] text-gignite-blue">
                {m.college}
                {m.branch ? ` · ${m.branch}` : ""}
                {m.year ? ` · ${m.year}` : ""}
              </span>
              {m.role_in_team && <span className="text-[13px] text-gignite-text/80">{m.role_in_team}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function SubmissionPanel({ reg }: { reg: AdminRegistration }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <h3 className="m-0 font-heading text-[22px] font-medium tracking-[-0.01em] text-black">Stage 1 submission</h3>
      <SubmissionField label="Problem statement" value={reg.problem_statement} />
      <SubmissionField label="Proposed solution" value={reg.proposed_solution} />
      <SubmissionField label="AI approach / technology" value={reg.ai_approach} />
      <SubmissionField label="Expected impact" value={reg.expected_impact} />
      {reg.supporting_link && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gignite-divider pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">
              Supporting material
            </span>
            <span className="truncate text-[15px] text-gignite-text">{reg.supporting_link}</span>
          </div>
          <a
            href={reg.supporting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b-[1.5px] border-gignite-blue/35 pb-0.5 text-[15px] font-semibold text-gignite-blue transition-colors hover:border-gignite-accent hover:text-gignite-accent"
          >
            Open link →
          </a>
        </div>
      )}
    </div>
  );
}

function SubmissionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">{label}</span>
      <p className="m-0 max-w-[80ch] whitespace-pre-wrap break-words text-[16px] leading-[1.7] text-gignite-text">
        {value}
      </p>
    </div>
  );
}

function RecordRow({
  label,
  value,
  mono,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3.5">
      <span className="text-[14px] text-gignite-text">{label}</span>
      <span className={cn("text-[14px] font-semibold text-black", mono && "font-mono font-medium", valueClassName)}>
        {value}
      </span>
    </div>
  );
}
