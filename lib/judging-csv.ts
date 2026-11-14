import { csvField } from "@/lib/csv";
import { formatScore, judgeProgress, JUDGE_PROGRESS_LABELS, summariseTeam, type JudgeProgress } from "@/lib/judging";
import { reportJudges, type JudgingReportTeam } from "@/lib/judging-load";
import { STAGE1_CRITERIA } from "@/lib/scoring";
import { REGISTRATION_STATUS_LABELS, VERIFICATION_STATUS_LABELS } from "@/lib/registration-status";

/**
 * The judging report (lib/judging-report.ts) as a spreadsheet: one row per
 * team. The team's judging counts (how many judges scored, are scoring,
 * haven't started) and result (total, average, spread) come first, then a
 * block of columns per judge — Judge 1, Judge 2, … — with their progress,
 * every criterion score, the weighted score and the comments. There are as
 * many judge blocks as the team with the most judges needs. As in the PDF,
 * a draft's scores are left out (not counted until submitted).
 */

/** "07 Nov 2026, 2:30 pm" in India time. */
function ist(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TEAM_HEADER = [
  "Team Id",
  "Team Name",
  "Track",
  "College",
  "District",
  "Submission Time",
  "Verification Status",
  "Registration Status",
  "Judges Assigned",
  "Judges Scored",
  "Judges Scoring In Progress",
  "Judges Not Started",
  "Judging Status",
  "Team Total Score",
  "Team Avg Score",
  "Team Score Spread",
];

function judgeHeader(n: number): string[] {
  const p = `Judge ${n}`;
  return [
    p,
    `${p} Progress`,
    `${p} Assigned At`,
    `${p} Last Saved / Submitted At`,
    ...STAGE1_CRITERIA.map((c) => `${p} ${c.label} (${c.weight}%)`),
    `${p} Weighted Score (out of 10)`,
    `${p} Comments`,
  ];
}

const JUDGE_COLUMNS = judgeHeader(1).length;

export function judgingDetailsCsv(teams: JudgingReportTeam[]): string {
  const maxJudges = Math.max(1, ...teams.map((t) => reportJudges(t).length));
  const header = [...TEAM_HEADER, ...Array.from({ length: maxJudges }, (_, i) => judgeHeader(i + 1)).flat()];

  const rows = teams.map((team) => {
    const summary = summariseTeam(team);
    const judges = reportJudges(team);
    const counts: Record<JudgeProgress, number> = { done: 0, in_progress: 0, not_started: 0 };
    for (const j of judges) counts[judgeProgress(team.scores, j.id)] += 1;

    const judgingStatus =
      judges.length === 0
        ? "No judges assigned"
        : summary.complete
          ? "All judges scored"
          : counts.done + counts.in_progress === 0
            ? "Not started"
            : "In progress";

    const judgeCells = Array.from({ length: maxJudges }, (_, i) => {
      const j = judges[i];
      if (!j) return Array<string>(JUDGE_COLUMNS).fill("");
      const score = team.scores.find((s) => s.judgeId === j.id);
      const done = score?.status === "submitted";
      const assignment = team.assignments.find((a) => a.judgeId === j.id);
      return [
        j.assigned ? j.name : `${j.name} (no longer assigned)`,
        JUDGE_PROGRESS_LABELS[judgeProgress(team.scores, j.id)],
        ist(assignment?.assignedAt),
        ist(score?.updatedAt),
        ...STAGE1_CRITERIA.map((c) => {
          const v = done ? score?.criteria[c.key] : undefined;
          return typeof v === "number" ? String(v) : "";
        }),
        done ? formatScore(score?.weighted, 2) : "",
        done ? (score?.comments ?? "").trim() : "",
      ];
    }).flat();

    return [
      team.entryCode,
      team.name,
      team.theme,
      team.college,
      team.district,
      ist(team.submittedAt),
      VERIFICATION_STATUS_LABELS[team.verification] ?? team.verification,
      REGISTRATION_STATUS_LABELS[team.status] ?? team.status,
      String(team.assignments.length),
      String(counts.done),
      String(counts.in_progress),
      String(counts.not_started),
      judgingStatus,
      summary.submitted ? formatScore(summary.total, 2) : "",
      summary.avg !== null ? formatScore(summary.avg, 2) : "",
      summary.spread !== null ? formatScore(summary.spread, 2) : "",
      ...judgeCells,
    ];
  });

  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\n");
}
