import { getTeamsForAdmin, getJudges } from "@/app/actions/admin";
import { TeamsBrowser } from "@/components/admin/teams-browser";

export default async function DashboardPage() {
  const [teamsResult, judgesResult] = await Promise.all([getTeamsForAdmin(), getJudges()]);

  if (!teamsResult.success) {
    return <p className="text-destructive">{teamsResult.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Registrations</h1>
      <TeamsBrowser teams={teamsResult.teams} judges={judgesResult.success ? judgesResult.judges : []} />
    </div>
  );
}
