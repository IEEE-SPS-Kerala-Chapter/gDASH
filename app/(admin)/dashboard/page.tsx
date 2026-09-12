import { getTeamsForAdmin, getJudges } from "@/app/actions/admin";
import { DashboardTable } from "@/components/admin/dashboard-table";

export default async function DashboardPage() {
  const [teamsResult, judgesResult] = await Promise.all([getTeamsForAdmin(), getJudges()]);

  if (!teamsResult.success) {
    return <p className="text-destructive">{teamsResult.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Registrations</h1>
      <DashboardTable teams={teamsResult.teams} judges={judgesResult.success ? judgesResult.judges : []} />
    </div>
  );
}
