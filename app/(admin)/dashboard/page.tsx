import { getTeamsForAdmin, getJudges } from "@/app/actions/admin";
import { getMyAssignedTeams } from "@/app/actions/judge";
import { getMyProfile } from "@/app/actions/profile";
import { TeamsBrowser } from "@/components/admin/teams-browser";
import { JudgeTeamsList } from "@/components/judge/judge-teams-list";

export default async function DashboardPage() {
  const profile = await getMyProfile();

  if (profile?.role === "judge") {
    const teamsResult = await getMyAssignedTeams();
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Your assigned teams</h1>
        {teamsResult.success ? (
          <JudgeTeamsList teams={teamsResult.teams} />
        ) : (
          <p className="text-destructive">{teamsResult.error}</p>
        )}
      </div>
    );
  }

  if (profile?.role === "volunteer") {
    return (
      <div className="rounded-md border bg-card py-16 text-center text-muted-foreground">
        Nothing here for you yet — check back once check-in opens closer to the event.
      </div>
    );
  }

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
