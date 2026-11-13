import { csvField } from "@/lib/csv";
import { formatScore, judgeProgress, JUDGE_PROGRESS_LABELS, summariseTeam } from "@/lib/judging";
import { reportJudges, type JudgingReportTeam } from "@/lib/judging-load";
import { STAGE1_CRITERIA } from "@/lib/scoring";
import { REGISTRATION_STATUS_LABELS, VERIFICATION_STATUS_LABELS } from "@/lib/registration-status";

/**
 * The judging report (lib/judging-report.ts) as a spreadsheet: one row per
 * judge per team, with every criterion score, the weighted score and the
 * comments, and the team's total, average and spread repeated on each of
 * its rows so the sheet can be sorted or filtered either way. A team with
 * no judges gets one row with the judge columns blank. As in the PDF, a
 * draft's scores are left out (not counted until submitted).
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

const HEADER = [
  "Team Id",
  "Team Name",
  "Track",
  "College",
  "District",
  "Submission Time",
  "Verification Status",
  "Registration Status",
  "Judge",
  "Still Assigned",
  "Progress",
  "Assigned At",
  "Last Saved / Submitted At",
  ...STAGE1_CRITERIA.map((c) => `${c.label} (${c.weight}%)`),
  "Weighted Score (out of 10)",
  "Comments",
  "Judges Submitted",
  "Team Total Score",
  "Team Avg Score",
  "Team Score Spread",
];

export function judgingDetailsCsv(teams: JudgingReportTeam[]): string {
  const rows: string[][] = [];
  for (const team of teams) {
    const summary = summariseTeam(team);
    const teamCells = [
      team.entryCode,
      team.name,
      team.theme,
      team.college,
      team.district,
      ist(team.submittedAt),
      VERIFICATION_STATUS_LABELS[team.verification] ?? team.verification,
      REGISTRATION_STATUS_LABELS[team.status] ?? team.status,
    ];
    const resultCells = [
      String(summary.submitted),
      summary.submitted ? formatScore(summary.total, 2) : "",
      summary.avg !== null ? formatScore(summary.avg, 2) : "",
      summary.spread !== null ? formatScore(summary.spread, 2) : "",
    ];
    const judges = reportJudges(team);
    if (judges.length === 0) {
      rows.push([...teamCells, "", "", "", "", "", ...STAGE1_CRITERIA.map(() => ""), "", "", ...resultCells]);
      continue;
    }
    for (const j of judges) {
      const score = team.scores.find((s) => s.judgeId === j.id);
      const done = score?.status === "submitted";
      const assignment = team.assignments.find((a) => a.judgeId === j.id);
      rows.push([
        ...teamCells,
        j.name,
        j.assigned ? "Yes" : "No",
        JUDGE_PROGRESS_LABELS[judgeProgress(team.scores, j.id)],
        ist(assignment?.assignedAt),
        ist(score?.updatedAt),
        ...STAGE1_CRITERIA.map((c) => {
          const v = done ? score?.criteria[c.key] : undefined;
          return typeof v === "number" ? String(v) : "";
        }),
        done ? formatScore(score?.weighted, 2) : "",
        done ? (score?.comments ?? "").trim() : "",
        ...resultCells,
      ]);
    }
  }
  return [HEADER, ...rows].map((r) => r.map(csvField).join(",")).join("\n");
}
