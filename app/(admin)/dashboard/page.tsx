import { getTeamsForAdmin, getJudges } from "@/app/actions/admin";
import { getMyAssignedTeams } from "@/app/actions/judge";
import { getMyProfile } from "@/app/actions/profile";
import { getRegistrationWindow } from "@/app/actions/registration-window";
import { TeamsBrowser } from "@/components/admin/teams-browser";
import { JudgeTeamsList } from "@/components/judge/judge-teams-list";
import { RegistrationWindowPanel } from "@/components/admin/registration-window-panel";
import { PageHeading, Panel } from "@/components/admin/ui";

export default async function DashboardPage() {
  const profile = await getMyProfile();

  if (profile?.role === "judge") {
    const teamsResult = await getMyAssignedTeams();
    return (
      <div className="flex flex-col gap-4">
        <PageHeading title="Your assigned teams" />
        {teamsResult.success ? (
          <JudgeTeamsList teams={teamsResult.teams} />
        ) : (
          <p className="text-gignite-danger">{teamsResult.error}</p>
        )}
      </div>
    );
  }

  if (profile?.role === "volunteer") {
    return (
      <Panel className="py-16 text-center text-[14px] text-gignite-text/60">
        Nothing here for you yet — check back once check-in opens closer to the event.
      </Panel>
    );
  }

  const [teamsResult, judgesResult, registrationWindow] = await Promise.all([
    getTeamsForAdmin(),
    getJudges(),
    getRegistrationWindow(),
  ]);

  if (!teamsResult.success) {
    return <p className="text-gignite-danger">{teamsResult.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Registrations" />
      <RegistrationWindowPanel initial={registrationWindow} />
      <TeamsBrowser teams={teamsResult.teams} judges={judgesResult.success ? judgesResult.judges : []} />
    </div>
  );
}
