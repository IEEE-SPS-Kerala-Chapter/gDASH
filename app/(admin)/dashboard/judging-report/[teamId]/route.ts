import { NextResponse } from "next/server";
import { getCallerRole } from "@/app/actions/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit-log";
import { buildJudgingReport } from "@/lib/judging-report";

export const maxDuration = 60;

/**
 * Admin / super-admin only: a team's judging report PDF (lib/judging-report.ts),
 * returned as the file itself — it's text only, well under a function
 * response's size limit. Used by the team page's "Judging report" button
 * and, many teams in parallel, by the Judging page's zip download.
 * `?single=1` records a single download in the audit log; the zip logs
 * once for the batch.
 */
export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return NextResponse.json({ error: "Only admins can download judging reports." }, { status: 403 });
  }
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  let report;
  try {
    report = await buildJudgingReport(teamId);
  } catch (err) {
    console.error(`judging report for ${teamId} failed:`, err);
    return NextResponse.json({ error: "Couldn't build the judging report. Try again." }, { status: 500 });
  }
  if (!report) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (new URL(request.url).searchParams.get("single") === "1") {
    const supabase = await createClient();
    await logAuditEvent(supabase, "team.judging_report_downloaded", { targetType: "team", targetId: teamId, targetLabel: report.fileName });
  }

  return new NextResponse(Buffer.from(report.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
      "X-File-Name": encodeURIComponent(report.fileName),
      "Cache-Control": "no-store",
    },
  });
}
