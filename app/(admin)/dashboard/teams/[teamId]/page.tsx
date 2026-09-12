import { notFound, redirect } from "next/navigation";
import { getTeamDetail, getJudges } from "@/app/actions/admin";
import { getMyProfile } from "@/app/actions/profile";
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

  const [teamResult, judgesResult] = await Promise.all([
    getTeamDetail(params.teamId),
    profile.role === "admin" ? getJudges() : Promise.resolve({ success: true as const, judges: [] }),
  ]);

  if (!teamResult.success) {
    notFound();
  }

  return (
    <TeamDetail
      team={teamResult.team}
      judges={judgesResult.success ? judgesResult.judges : []}
      viewerRole={profile.role}
    />
  );
}
