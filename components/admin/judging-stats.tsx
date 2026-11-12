"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Badge, Panel, SegmentedToggle } from "@/components/admin/ui";
import { useJudgingReportsZip } from "./judging-reports";
import { REGISTRATION_STATUS_LABELS } from "@/lib/registration-status";
import { STAGE1_CRITERIA } from "@/lib/scoring";
import {
  DISAGREEMENT_THRESHOLD,
  JUDGE_PROGRESS_BADGE,
  JUDGE_PROGRESS_LABELS,
  LENIENCY_THRESHOLD,
  formatScore,
  leniencyLabel,
  panelCriteriaAverages,
  scoreDistribution,
  summariseJudge,
  summariseTeam,
  type JudgeProgress,
  type JudgeSummary,
  type JudgingJudge,
  type JudgingTeam,
} from "@/lib/judging";
import { cn } from "@/lib/utils";

/**
 * The Judging page: every judge with the teams assigned to them, coloured
 * by progress (green scored, yellow draft saved, red not started), plus
 * panel-wide statistics and what needs an organiser's attention. Data from
 * getJudgingOverview() (app/actions/judging.ts); everything else is
 * worked out here.
 */

const PROGRESS_BAR: Record<JudgeProgress, string> = {
  done: "bg-ignite-success",
  in_progress: "bg-ignite-warn",
  not_started: "bg-ignite-danger",
};

type ProgressFilter = "all" | JudgeProgress;
type JudgeSort = "name" | "least_complete" | "most_assigned";

function formatWhen(iso: string | null): string {
  if (!iso) return "No activity yet";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function teamHref(id: string) {
  return `/dashboard/teams/${id}`;
}

function ProgressBar({ counts, className }: { counts: Record<JudgeProgress, number>; className?: string }) {
  const total = counts.done + counts.in_progress + counts.not_started;
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-ignite-lavender", className)}>
      {total > 0 &&
        (["done", "in_progress", "not_started"] as JudgeProgress[]).map((p) =>
          counts[p] > 0 ? <div key={p} className={PROGRESS_BAR[p]} style={{ width: `${(counts[p] / total) * 100}%` }} /> : null,
        )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 font-ui text-[12px] text-ignite-muted">
      {(["done", "in_progress", "not_started"] as JudgeProgress[]).map((p) => (
        <span key={p} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", PROGRESS_BAR[p])} />
          {JUDGE_PROGRESS_LABELS[p]}
        </span>
      ))}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Panel className="flex flex-col gap-1.5 p-5">
      <span className="font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-ignite-muted">{label}</span>
      <span className="font-display text-[26px] font-bold leading-none text-ignite-ink">{value}</span>
      {hint && <span className="font-ui text-[12px] leading-[1.45] text-ignite-muted">{hint}</span>}
    </Panel>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="m-0 font-display text-[19px] font-bold tracking-[-0.01em] text-ignite-ink">{children}</h2>
      {aside}
    </div>
  );
}

function TeamChip({ team, progress, score }: { team: JudgingTeam; progress: JudgeProgress; score?: number | null }) {
  return (
    <Link href={teamHref(team.id)} title={`${team.name} (${team.entryCode}) — ${JUDGE_PROGRESS_LABELS[progress]}`}>
      <Badge variant={JUDGE_PROGRESS_BADGE[progress]} className="max-w-[220px] gap-1.5 normal-case tracking-normal text-[11.5px] transition-opacity hover:opacity-80">
        <span className="truncate">{team.name}</span>
        {progress === "done" && score != null && <span className="font-ui font-bold">{score.toFixed(1)}</span>}
      </Badge>
    </Link>
  );
}

function AttentionList({
  title,
  description,
  items,
  empty,
}: {
  title: string;
  description: string;
  items: { key: string; href?: string; label: string; detail?: string }[];
  empty: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 6);
  return (
    <Panel className="flex flex-col gap-2.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[15px] font-semibold text-ignite-ink">{title}</span>
          <span className="font-ui text-[12px] leading-[1.45] text-ignite-muted">{description}</span>
        </div>
        <Badge variant={items.length ? "warn" : "success"}>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <span className="text-[13px] text-ignite-muted">{empty}</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {shown.map((item) => (
            <li key={item.key} className="flex items-baseline justify-between gap-3 text-[13.5px]">
              {item.href ? (
                <Link href={item.href} className="truncate font-semibold text-ignite-ink hover:text-ignite-magenta">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-ignite-ink">{item.label}</span>
              )}
              {item.detail && <span className="flex-none font-ui text-[12px] text-ignite-muted">{item.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="self-start font-ui text-[12px] font-semibold text-ignite-ink hover:text-ignite-magenta">
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </Panel>
  );
}

function JudgeCard({ summary, filter }: { summary: JudgeSummary; filter: ProgressFilter }) {
  const assigned = summary.teams.length;
  const teams = filter === "all" ? summary.teams : summary.teams.filter((t) => t.progress === filter);
  const leniency = summary.leniency;
  return (
    <Panel className="flex flex-col gap-3.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-[16px] font-semibold text-ignite-ink">{summary.judge.name}</span>
          <span className="truncate font-ui text-[12px] text-ignite-muted">{summary.judge.email}</span>
        </div>
        <span className="flex-none font-display text-[15px] font-bold text-ignite-ink">
          {summary.counts.done}/{assigned}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <ProgressBar counts={summary.counts} />
        <span className="font-ui text-[12px] text-ignite-muted">
          {assigned === 0
            ? "No teams assigned"
            : `${summary.counts.done} scored · ${summary.counts.in_progress} in progress · ${summary.counts.not_started} not started`}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 font-ui text-[12.5px]">
        <div className="flex flex-col">
          <dt className="text-ignite-muted">Average given</dt>
          <dd className="m-0 font-semibold text-ignite-ink">{formatScore(summary.avgGiven, 2)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-ignite-muted">Range</dt>
          <dd className="m-0 font-semibold text-ignite-ink">
            {summary.minGiven === null ? "—" : `${formatScore(summary.minGiven)} – ${formatScore(summary.maxGiven)}`}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-ignite-muted">Compared with the panel</dt>
          <dd
            className={cn(
              "m-0 font-semibold",
              leniency !== null && summary.counts.done >= 3 && Math.abs(leniency) >= LENIENCY_THRESHOLD ? "text-ignite-warn" : "text-ignite-ink",
            )}
            title="This judge's score minus the other judges' average, on the same teams"
          >
            {leniencyLabel(leniency, summary.counts.done)}
            {leniency !== null && summary.counts.done >= 3 ? ` (${leniency > 0 ? "+" : ""}${leniency.toFixed(2)})` : ""}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-ignite-muted">Last scored</dt>
          <dd className="m-0 font-semibold text-ignite-ink">{formatWhen(summary.lastActivity)}</dd>
        </div>
      </dl>
      {teams.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((t) => (
            <TeamChip key={t.team.id} team={t.team} progress={t.progress} score={t.weighted} />
          ))}
        </div>
      ) : (
        assigned > 0 && <span className="text-[12.5px] text-ignite-muted">No teams with this progress.</span>
      )}
    </Panel>
  );
}

export function JudgingStats({ teams, judges }: { teams: JudgingTeam[]; judges: JudgingJudge[] }) {
  const [filter, setFilter] = useState<ProgressFilter>("all");
  const [sort, setSort] = useState<JudgeSort>("least_complete");
  const [query, setQuery] = useState("");
  const [showAllRanks, setShowAllRanks] = useState(false);
  const zip = useJudgingReportsZip();

  const data = useMemo(() => {
    // Judges who were assigned teams but no longer have the judge role still show up.
    const known = new Map(judges.map((j) => [j.id, j]));
    for (const t of teams) {
      for (const a of t.assignments) if (!known.has(a.judgeId)) known.set(a.judgeId, { id: a.judgeId, name: a.judgeName, email: "No longer a judge" });
    }
    const judgeSummaries = [...known.values()].map((j) => summariseJudge(j, teams));
    const teamSummaries = teams.map(summariseTeam);

    const pairs: Record<JudgeProgress, number> = { done: 0, in_progress: 0, not_started: 0 };
    judgeSummaries.forEach((j) => (["done", "in_progress", "not_started"] as JudgeProgress[]).forEach((p) => (pairs[p] += j.counts[p])));
    const pairTotal = pairs.done + pairs.in_progress + pairs.not_started;

    const eligible = teamSummaries.filter((s) => s.team.verification === "verified");
    const withJudges = teamSummaries.filter((s) => s.assigned > 0);
    const complete = withJudges.filter((s) => s.complete);
    const scoredAvgs = teamSummaries.filter((s) => s.avg !== null).map((s) => s.avg as number);
    const undecided = (s: (typeof teamSummaries)[number]) => s.team.status === "submitted" || s.team.status === "under_review";

    return {
      judgeSummaries,
      teamSummaries,
      pairs,
      pairTotal,
      eligible,
      withJudges,
      complete,
      panelAvg: scoredAvgs.length ? scoredAvgs.reduce((a, b) => a + b, 0) / scoredAvgs.length : null,
      noJudges: eligible.filter((s) => s.assigned === 0 && undecided(s)),
      oneJudge: eligible.filter((s) => s.assigned === 1 && undecided(s)),
      disagreements: teamSummaries.filter((s) => s.spread !== null && s.spread >= DISAGREEMENT_THRESHOLD).sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0)),
      readyForDecision: complete.filter(undecided),
      idleJudges: judgeSummaries.filter((j) => j.teams.length === 0),
      criteria: panelCriteriaAverages(teams),
      distribution: scoreDistribution(teamSummaries),
      ranking: teamSummaries.filter((s) => s.complete && s.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)),
    };
  }, [teams, judges]);

  const visibleJudges = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.judgeSummaries.filter(
      (j) => !q || j.judge.name.toLowerCase().includes(q) || j.teams.some((t) => t.team.name.toLowerCase().includes(q) || t.team.entryCode.toLowerCase().includes(q)),
    );
    const completion = (j: JudgeSummary) => (j.teams.length ? j.counts.done / j.teams.length : 2);
    return list.sort((a, b) =>
      sort === "name"
        ? a.judge.name.localeCompare(b.judge.name)
        : sort === "most_assigned"
          ? b.teams.length - a.teams.length || a.judge.name.localeCompare(b.judge.name)
          : completion(a) - completion(b) || a.judge.name.localeCompare(b.judge.name),
    );
  }, [data.judgeSummaries, query, sort]);

  const zipTeams = useMemo(() => teams.filter((t) => t.assignments.length > 0 || t.scores.length > 0), [teams]);
  const completion = data.pairTotal ? Math.round((data.pairs.done / data.pairTotal) * 100) : 0;
  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));
  const scoredJudges = data.judgeSummaries.filter((j) => j.counts.done > 0).sort((a, b) => a.judge.name.localeCompare(b.judge.name));
  const ranking = showAllRanks ? data.ranking : data.ranking.slice(0, 15);

  return (
    <div className="flex flex-col gap-8">
      {zip.panel}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <button
          type="button"
          onClick={() => zip.start(zipTeams)}
          disabled={zip.running}
          className="flex items-center gap-2 rounded-[9px] border-[1.5px] border-ignite-ink px-4 py-2 font-display text-[14px] font-medium text-ignite-ink transition-colors hover:bg-ignite-primary hover:text-ignite-on-primary disabled:cursor-wait disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {zip.running ? "Building zip…" : `Download all judging reports (${zipTeams.length})`}
        </button>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="Judges" value={data.judgeSummaries.length} hint={`${data.judgeSummaries.length - data.idleJudges.length} with teams assigned`} />
        <Tile label="Verified teams" value={data.eligible.length} hint={`${data.withJudges.length} have judges assigned`} />
        <Tile label="Fully judged" value={`${data.complete.length}/${data.withJudges.length}`} hint="Teams where every assigned judge submitted" />
        <Tile
          label="Judging done"
          value={`${completion}%`}
          hint={<ProgressBar counts={data.pairs} className="mt-1" />}
        />
        <Tile label="Panel average" value={formatScore(data.panelAvg, 2)} hint="Mean of the teams' average scores, out of 10" />
        <Tile label="Ready to decide" value={data.readyForDecision.length} hint="All scores in, still not shortlisted or rejected" />
      </div>

      <Panel className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-[15px] font-semibold text-ignite-ink">Overall progress</span>
          <span className="font-ui text-[12.5px] text-ignite-muted">
            {data.pairs.done} scored · {data.pairs.in_progress} in progress · {data.pairs.not_started} not started — of {data.pairTotal} judge-team assignments
          </span>
        </div>
        <ProgressBar counts={data.pairs} className="h-3.5" />
      </Panel>

      {/* Attention */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Needs attention</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AttentionList
            title="Verified teams with no judge"
            description="Eligible and undecided, but nobody is assigned to score them."
            items={data.noJudges.map((s) => ({ key: s.team.id, href: teamHref(s.team.id), label: s.team.name, detail: s.team.entryCode }))}
            empty="Every verified team has a judge."
          />
          <AttentionList
            title="Teams with only one judge"
            description="One opinion decides these teams. Consider adding a second judge."
            items={data.oneJudge.map((s) => ({ key: s.team.id, href: teamHref(s.team.id), label: s.team.name, detail: s.team.assignments[0]?.judgeName }))}
            empty="No team relies on a single judge."
          />
          <AttentionList
            title="Judges disagree"
            description={`Submitted scores ${DISAGREEMENT_THRESHOLD} or more points apart. Worth a discussion before deciding.`}
            items={data.disagreements.map((s) => ({
              key: s.team.id,
              href: teamHref(s.team.id),
              label: s.team.name,
              detail: `spread ${formatScore(s.spread)}`,
            }))}
            empty="No big disagreements."
          />
          <AttentionList
            title="Ready for a decision"
            description="Every assigned judge has submitted. Shortlist or reject from the team page."
            items={data.readyForDecision.map((s) => ({ key: s.team.id, href: teamHref(s.team.id), label: s.team.name, detail: `avg ${formatScore(s.avg)}` }))}
            empty="Nothing waiting on a decision."
          />
          <AttentionList
            title="Judges not started"
            description="Judges with assigned teams who haven't saved a single score."
            items={data.judgeSummaries
              .filter((j) => j.teams.length > 0 && j.counts.done === 0 && j.counts.in_progress === 0)
              .map((j) => ({ key: j.judge.id, label: j.judge.name, detail: `${j.teams.length} team${j.teams.length === 1 ? "" : "s"}` }))}
            empty="Every judge with teams has started."
          />
          <AttentionList
            title="Judges with no teams"
            description="Available to take on more teams."
            items={data.idleJudges.map((j) => ({ key: j.judge.id, label: j.judge.name }))}
            empty="Every judge has teams."
          />
        </div>
      </section>

      {/* Judges */}
      <section className="flex flex-col gap-3">
        <SectionTitle
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-[9px] border-[1.5px] border-ignite-edge/[0.12] bg-ignite-surface px-3 py-[7px]">
                <Search className="h-4 w-4 text-ignite-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Judge or team"
                  className="w-36 border-none bg-transparent font-ui text-[13.5px] text-ignite-ink outline-none placeholder:text-ignite-muted"
                />
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as JudgeSort)}
                className="rounded-[9px] border-[1.5px] border-ignite-edge/[0.12] bg-ignite-surface px-3 py-[8px] font-ui text-[13.5px] text-ignite-ink-soft outline-none"
              >
                <option value="least_complete">Least complete first</option>
                <option value="most_assigned">Most teams first</option>
                <option value="name">Name</option>
              </select>
            </div>
          }
        >
          Judges and their teams
        </SectionTitle>
        <SegmentedToggle
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All teams" },
            { value: "not_started", label: "Not started" },
            { value: "in_progress", label: "In progress" },
            { value: "done", label: "Scored" },
          ]}
        />
        {visibleJudges.length === 0 ? (
          <Panel className="py-10 text-center text-[14px] text-ignite-muted">{judges.length === 0 ? "No judge accounts yet." : "No judge or team matches."}</Panel>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleJudges.map((j) => (
              <JudgeCard key={j.judge.id} summary={j} filter={filter} />
            ))}
          </div>
        )}
      </section>

      {/* Criteria */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Average score by criterion</SectionTitle>
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse font-ui text-[13px]">
            <thead>
              <tr className="border-b border-ignite-edge/[0.08] text-left text-[11px] uppercase tracking-[0.1em] text-ignite-muted">
                <th className="px-4 py-3 font-bold">Judge</th>
                {STAGE1_CRITERIA.map((c) => (
                  <th key={c.key} className="px-3 py-3 text-right font-bold" title={c.description}>
                    {c.label} <span className="font-normal normal-case tracking-normal">({c.weight}%)</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-bold">Weighted</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ignite-edge/[0.08] bg-ignite-lavender/40 font-semibold text-ignite-ink">
                <td className="px-4 py-2.5">Whole panel</td>
                {STAGE1_CRITERIA.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 text-right">
                    {formatScore(data.criteria[c.key])}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">{formatScore(data.panelAvg, 2)}</td>
              </tr>
              {scoredJudges.map((j) => (
                <tr key={j.judge.id} className="border-b border-ignite-edge/[0.05] text-ignite-ink-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-ignite-ink">{j.judge.name}</td>
                  {STAGE1_CRITERIA.map((c) => {
                    const v = j.criteriaAvg[c.key];
                    const p = data.criteria[c.key];
                    const diff = v !== undefined && p !== undefined ? v - p : 0;
                    return (
                      <td
                        key={c.key}
                        className={cn("px-3 py-2.5 text-right", diff >= 1 && "font-semibold text-ignite-success", diff <= -1 && "font-semibold text-ignite-danger")}
                      >
                        {formatScore(v)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right font-semibold text-ignite-ink">{formatScore(j.avgGiven, 2)}</td>
                </tr>
              ))}
              {scoredJudges.length === 0 && (
                <tr>
                  <td colSpan={STAGE1_CRITERIA.length + 2} className="px-4 py-6 text-center text-ignite-muted">
                    No scores submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
        <span className="font-ui text-[12px] text-ignite-muted">Green or red: a judge&apos;s average for that criterion is a point or more above or below the whole panel&apos;s.</span>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.6fr]">
        {/* Distribution */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Spread of team averages</SectionTitle>
          <Panel className="flex flex-col gap-2 p-5">
            {data.distribution
              .slice()
              .reverse()
              .map((b) => (
                <div key={b.label} className="flex items-center gap-3 font-ui text-[12.5px]">
                  <span className="w-10 flex-none text-right text-ignite-muted">{b.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-[4px] bg-ignite-lavender/60">
                    <div className="h-full rounded-[4px] bg-ignite-primary" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                  </div>
                  <span className="w-6 flex-none font-semibold text-ignite-ink">{b.count}</span>
                </div>
              ))}
            <span className="mt-1 font-ui text-[12px] text-ignite-muted">Teams by their average submitted score, out of 10.</span>
          </Panel>
        </section>

        {/* Ranking */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Ranking of fully judged teams</SectionTitle>
          <Panel className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] border-collapse font-ui text-[13px]">
              <thead>
                <tr className="border-b border-ignite-edge/[0.08] text-left text-[11px] uppercase tracking-[0.1em] text-ignite-muted">
                  <th className="px-4 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">Team</th>
                  <th className="px-3 py-3 font-bold">Judges&apos; scores</th>
                  <th className="px-3 py-3 text-right font-bold">Average</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((s, i) => (
                  <tr key={s.team.id} className="border-b border-ignite-edge/[0.05] last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ignite-muted">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link href={teamHref(s.team.id)} className="font-semibold text-ignite-ink hover:text-ignite-magenta">
                        {s.team.name}
                      </Link>
                      <span className="block text-[11.5px] text-ignite-muted">
                        {s.team.entryCode} · {s.team.theme}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ignite-ink-soft">
                      {s.team.scores
                        .filter((x) => x.status === "submitted")
                        .map((x) => formatScore(x.weighted))
                        .join(" · ")}
                      {s.spread !== null && s.spread >= DISAGREEMENT_THRESHOLD && (
                        <Badge variant="warn" className="ml-2 px-2 py-0.5 text-[9px]">
                          Disagree
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-display text-[14px] font-bold text-ignite-ink">{formatScore(s.avg, 2)}</td>
                    <td className="px-4 py-2.5 text-ignite-ink-soft">{REGISTRATION_STATUS_LABELS[s.team.status] ?? s.team.status}</td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ignite-muted">
                      No team has all its scores in yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
          {data.ranking.length > 15 && (
            <button type="button" onClick={() => setShowAllRanks((v) => !v)} className="self-start font-ui text-[12.5px] font-semibold text-ignite-ink hover:text-ignite-magenta">
              {showAllRanks ? "Show top 15" : `Show all ${data.ranking.length}`}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
