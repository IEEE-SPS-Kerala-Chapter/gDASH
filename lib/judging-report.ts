import { rgb, type PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBrandedPdf, formatDate, wrap, CONTENT_W, INK, MAGENTA, MARGIN, MUTED, RULE, type Fonts, type Writer } from "@/lib/team-report";
import { JUDGE_PROGRESS_LABELS, judgeProgress, summariseTeam, formatScore, DISAGREEMENT_THRESHOLD } from "@/lib/judging";
import { JUDGING_REPORT_SELECT, mapJudgingReportTeam, reportJudges } from "@/lib/judging-load";
import { STAGE1_CRITERIA } from "@/lib/scoring";
import { REGISTRATION_STATUS_LABELS, VERIFICATION_STATUS_LABELS } from "@/lib/registration-status";
import { reportFileBase } from "@/lib/report-file-name";

/**
 * A team's Stage 1 judging report for organisers, in the team report's
 * house style (lib/team-report.ts): the result (each judge's weighted
 * score, their total and the average), a criterion-by-judge table, then
 * every judge's scores and comments. Built fresh on each download — it's
 * text only, so it's small and quick.
 *
 * Uses the service-role client — callers must have checked the caller is
 * an admin.
 */

export type JudgingReport = { fileName: string; pdf: Uint8Array };

const HEADER_FILL = rgb(0xf4 / 255, 0xf1 / 255, 0xfa / 255);
const GREEN = rgb(0x1f / 255, 0x8a / 255, 0x4c / 255);
const AMBER = rgb(0xb7 / 255, 0x79 / 255, 0x0b / 255);
const RED = rgb(0xc5 / 255, 0x30 / 255, 0x30 / 255);

type Column = { label: string; width: number; align?: "left" | "right" };

/** A simple ruled table; long cells are cut to one line. The last row can be bold (totals). */
function table(w: Writer, fonts: Fonts, columns: Column[], rows: string[][], opts: { boldLast?: boolean } = {}) {
  const rowH = 19;
  const size = 9.5;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = CONTENT_W / totalW;
  const cols = columns.map((c) => ({ ...c, width: c.width * scale }));

  const drawRow = (cells: string[], font: PDFFont, color: ReturnType<typeof rgb>, fill?: ReturnType<typeof rgb>) => {
    w.ensure(rowH);
    const top = w.y;
    if (fill) w.page.drawRectangle({ x: MARGIN, y: top - rowH, width: CONTENT_W, height: rowH, color: fill });
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const col = cols[i];
      const text = cell ? (wrap(cell, font, size, col.width - 10)[0] ?? "") : "";
      const tw = font.widthOfTextAtSize(text, size);
      const tx = col.align === "right" ? x + col.width - 6 - tw : x + 6;
      w.page.drawText(text, { x: tx, y: top - rowH + 6, size, font, color });
      x += col.width;
    });
    w.page.drawLine({ start: { x: MARGIN, y: top - rowH }, end: { x: MARGIN + CONTENT_W, y: top - rowH }, thickness: 0.6, color: RULE });
    w.y = top - rowH;
  };

  // Keep the header with at least two rows.
  w.ensure(rowH * 3);
  drawRow(cols.map((c) => c.label), fonts.bold, MUTED, HEADER_FILL);
  rows.forEach((r, i) => drawRow(r, opts.boldLast && i === rows.length - 1 ? fonts.bold : fonts.regular, INK));
  w.y -= 8;
}

export async function buildJudgingReport(teamId: string): Promise<JudgingReport | null> {
  const { data, error } = await createAdminClient().from("teams").select(JUDGING_REPORT_SELECT).eq("id", teamId).maybeSingle();
  if (error) throw new Error(`could not load team: ${error.message}`);
  const team = data ? mapJudgingReportTeam(data) : null;
  if (!team) return null;
  const { college, submittedAt: regCreated } = team;

  const summary = summariseTeam(team);
  const fileBase = reportFileBase(team.name, team.entryCode);

  const judges = reportJudges(team);
  const scoreOf = (judgeId: string) => team.scores.find((s) => s.judgeId === judgeId);
  const submitted = (judgeId: string) => {
    const s = scoreOf(judgeId);
    return s && s.status === "submitted" ? s : undefined;
  };

  const { doc, fonts, w } = await createBrandedPdf(
    `${team.name} (${team.entryCode}) — gIGNITE 2026 judging report`,
    `gIGNITE 2026 · Judging report · ${team.name} · ${team.entryCode} · generated ${formatDate(new Date().toISOString())}`,
  );

  w.wordmark(30);
  w.text("2026 · STAGE 1 JUDGING REPORT", { font: fonts.bold, size: 9, color: MAGENTA, gap: 6 });
  w.text(team.name, { font: fonts.display, size: 22, gap: 2 });
  w.text(`${team.entryCode} · ${team.theme}`, { font: fonts.semi, size: 11.5, color: MUTED, gap: 6 });

  w.heading("Team");
  w.field("Team ID", team.entryCode);
  w.field("Track", team.theme);
  w.field("College", college);
  w.field("District", team.district);
  if (regCreated) w.field("Submitted", formatDate(regCreated));
  w.field("Verification", VERIFICATION_STATUS_LABELS[team.verification] ?? team.verification);
  w.field("Status", REGISTRATION_STATUS_LABELS[team.status] ?? team.status);

  // Result.
  w.heading("Result");
  w.field("Judges assigned", String(team.assignments.length));
  w.field("Scores submitted", `${summary.submitted} of ${judges.length}`);
  w.field("Total score", summary.submitted ? `${formatScore(summary.total, 2)} out of ${summary.submitted * 10}` : "No scores submitted yet");
  w.field("Average score", summary.avg !== null ? `${formatScore(summary.avg, 2)} / 10` : "—");
  if (summary.spread !== null) {
    w.field(
      "Score spread",
      `${formatScore(summary.spread, 2)} points between the highest and lowest score${summary.spread >= DISAGREEMENT_THRESHOLD ? " — the judges disagree noticeably" : ""}`,
    );
  }
  w.y -= 6;
  table(
    w,
    fonts,
    [
      { label: "Judge", width: 220 },
      { label: "Progress", width: 150 },
      { label: "Weighted score", width: 110, align: "right" },
    ],
    [
      ...judges.map((j) => {
        const s = submitted(j.id);
        return [
          j.assigned ? j.name : `${j.name} (no longer assigned)`,
          JUDGE_PROGRESS_LABELS[judgeProgress(team.scores, j.id)],
          s ? `${formatScore(s.weighted, 2)} / 10` : "—",
        ];
      }),
      ["Total (sum of submitted scores)", "", summary.submitted ? formatScore(summary.total, 2) : "—"],
      ["Average", "", summary.avg !== null ? `${formatScore(summary.avg, 2)} / 10` : "—"],
    ],
    { boldLast: true },
  );

  // Criterion by judge.
  if (summary.submitted > 0) {
    const scored = judges.filter((j) => submitted(j.id));
    w.heading("Scores by criterion", 19 * 3);
    table(
      w,
      fonts,
      [
        { label: "Criterion (weight)", width: 230 },
        ...scored.map((j) => ({ label: j.name.split(" ")[0], width: 70, align: "right" as const })),
        { label: "Average", width: 70, align: "right" },
      ],
      [
        ...STAGE1_CRITERIA.map((c) => {
          const values = scored.map((j) => submitted(j.id)!.criteria[c.key]);
          const nums = values.filter((v): v is number => typeof v === "number");
          return [
            `${c.label} (${c.weight}%)`,
            ...values.map((v) => (typeof v === "number" ? String(v) : "—")),
            nums.length ? formatScore(nums.reduce((a, b) => a + b, 0) / nums.length) : "—",
          ];
        }),
        ["Weighted score", ...scored.map((j) => formatScore(submitted(j.id)!.weighted, 2)), formatScore(summary.avg, 2)],
      ],
      { boldLast: true },
    );
    w.text("Each criterion is scored 1–10. The weighted score is the weighted average of the five, on the same 1–10 scale.", {
      size: 9,
      color: MUTED,
    });
  }

  // Each judge.
  for (const j of judges) {
    const s = scoreOf(j.id);
    const progress = judgeProgress(team.scores, j.id);
    w.heading(`Judge — ${j.name}`, 60);
    w.text(JUDGE_PROGRESS_LABELS[progress] + (j.assigned ? "" : " · no longer assigned to this team"), {
      font: fonts.bold,
      size: 10,
      color: progress === "done" ? GREEN : progress === "in_progress" ? AMBER : RED,
      gap: 2,
    });
    const assignment = team.assignments.find((a) => a.judgeId === j.id);
    if (assignment) w.field("Assigned", formatDate(assignment.assignedAt));
    if (s) w.field(progress === "done" ? "Submitted" : "Last saved", formatDate(s.updatedAt));

    if (progress !== "done" || !s) {
      w.text(progress === "in_progress" ? "This judge has saved a draft but not submitted it, so it isn't counted." : "This judge hasn't scored this team yet.", {
        color: MUTED,
        gap: 4,
      });
      continue;
    }
    w.y -= 4;
    table(
      w,
      fonts,
      [
        { label: "Criterion", width: 250 },
        { label: "Weight", width: 70, align: "right" },
        { label: "Score", width: 70, align: "right" },
        { label: "Points", width: 80, align: "right" },
      ],
      [
        ...STAGE1_CRITERIA.map((c) => {
          const v = s.criteria[c.key];
          return [c.label, `${c.weight}%`, typeof v === "number" ? `${v} / 10` : "—", typeof v === "number" ? ((v * c.weight) / 100).toFixed(2) : "—"];
        }),
        ["Weighted score", "100%", "", `${formatScore(s.weighted, 2)} / 10`],
      ],
      { boldLast: true },
    );
    w.text("Comments", { font: fonts.semi, size: 11, gap: 2 });
    w.text(s.comments?.trim() || "No comments.", { size: 10.5, color: s.comments?.trim() ? INK : MUTED, gap: 6 });
  }

  if (judges.length === 0) {
    w.heading("Judges");
    w.text("No judges have been assigned to this team yet.", { color: MUTED });
  }

  return { fileName: `${fileBase}-judging.pdf`, pdf: await doc.save() };
}
