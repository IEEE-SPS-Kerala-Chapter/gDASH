import { notFound, redirect } from "next/navigation";
import { getTeamDetail, getJudges } from "@/app/actions/admin";
import { getMyAssignedTeams } from "@/app/actions/judge";
import { getMyProfile } from "@/app/actions/profile";
import { redactMemberContactInfo } from "@/lib/admin-teams";
import { isAdminLevelRole } from "@/lib/roles";
import { TeamDetail } from "@/components/admin/team-detail";

export default async function TeamDetailPage({ params }: { params: { teamId: string } }) {
  const profile = await getMyProfile();
  if (!profile) {
    redirect("/login");
  }
  // Volunteers have no dashboard view yet — RLS would deny the team query
  // anyway, but bounce cleanly rather than showing a 404 for a role that
  // was never meant to land here.
  if (profile.role === "volunteer") {
    redirect("/dashboard");
  }

  const [teamResult, judgesResult, queueResult] = await Promise.all([
    getTeamDetail(params.teamId),
    isAdminLevelRole(profile.role) ? getJudges() : Promise.resolve({ success: true as const, judges: [] }),
    // Only judges get prev/next queue navigation — same ordering as the
    // submission queue on their dashboard, so "next" there matches "next" here.
    profile.role === "judge" ? getMyAssignedTeams() : Promise.resolve({ success: true as const, teams: [] }),
  ]);

  if (!teamResult.success) {
    notFound();
  }

  let queueNav: { prevTeamId: string | null; nextTeamId: string | null; position: string } | null = null;
  if (profile.role === "judge" && queueResult.success) {
    const ids = queueResult.teams.map((t) => t.id);
    const index = ids.indexOf(params.teamId);
    if (index !== -1) {
      queueNav = {
        prevTeamId: index > 0 ? ids[index - 1] : null,
        nextTeamId: index < ids.length - 1 ? ids[index + 1] : null,
        position: `Submission ${index + 1} of ${ids.length}`,
      };
    }
  }

  // Same reasoning as getMyAssignedTeams: judges never see member contact
  // info, so strip it here rather than trusting the UI alone not to render it.
  const team = profile.role === "judge" ? redactMemberContactInfo(teamResult.team) : teamResult.team;

  return (
    <TeamDetail
      team={team}
      judges={judgesResult.success ? judgesResult.judges : []}
      viewerRole={profile.role}
      queueNav={queueNav}
    />
  );
}
