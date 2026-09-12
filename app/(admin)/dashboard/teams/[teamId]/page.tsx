import { notFound } from "next/navigation";
import { getTeamDetail, getJudges } from "@/app/actions/admin";
import { TeamDetail } from "@/components/admin/team-detail";

export default async function TeamDetailPage({ params }: { params: { teamId: string } }) {
  const [teamResult, judgesResult] = await Promise.all([getTeamDetail(params.teamId), getJudges()]);

  if (!teamResult.success) {
    notFound();
  }

  return <TeamDetail team={teamResult.team} judges={judgesResult.success ? judgesResult.judges : []} />;
}
