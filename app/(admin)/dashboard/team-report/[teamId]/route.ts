import { NextResponse } from "next/server";
import { getCallerRole } from "@/app/actions/admin";
import { isAdminLevelRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit-log";
import { getTeamReport, signedDownloadUrl, TEAM_REPORTS_BUCKET } from "@/lib/team-report";

// Building a report renders every member's ID card and merges the deck.
export const maxDuration = 120;

/**
 * Admin / super-admin only: a team's report PDF (built if needed, see
 * lib/team-report.ts) and its uploaded deck, as short-lived download links — never the file
 * itself, which can be larger than a function response may be. Used one
 * team at a time by the "Download team report" button and by the zip
 * downloads, which call it for many teams in parallel (a route, not a
 * server action, because server actions from one page run one at a time).
 * `?single=1` records a single download in the audit log; the zip
 * downloads log once for the whole batch.
 */
export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const caller = await getCallerRole();
  if (!caller || !isAdminLevelRole(caller.role)) {
    return NextResponse.json({ error: "Only admins can download team reports." }, { status: 403 });
  }
  const { teamId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  let report;
  try {
    report = await getTeamReport(teamId);
  } catch (err) {
    console.error(`team report for ${teamId} failed:`, err);
    return NextResponse.json({ error: "Couldn't build the report. Try again." }, { status: 500 });
  }
  if (!report) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const [pdfUrl, deckUrl] = await Promise.all([
    signedDownloadUrl(TEAM_REPORTS_BUCKET, report.pdfPath, `${report.fileBase}.pdf`),
    report.deck ? signedDownloadUrl("registration-decks", report.deck.path, report.deck.fileName) : null,
  ]);
  if (!pdfUrl) {
    return NextResponse.json({ error: "Couldn't create the download link. Try again." }, { status: 500 });
  }

  if (new URL(request.url).searchParams.get("single") === "1") {
    const supabase = await createClient();
    await logAuditEvent(supabase, "team.report_downloaded", { targetType: "team", targetId: teamId, targetLabel: report.fileBase });
  }

  return NextResponse.json(
    {
      fileBase: report.fileBase,
      pdfUrl,
      deck: report.deck && deckUrl ? { url: deckUrl, fileName: report.deck.fileName } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
