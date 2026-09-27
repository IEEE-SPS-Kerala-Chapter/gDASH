import { getTeamsForAdmin, getJudges } from "@/app/actions/admin";
import { getMyAssignedTeams } from "@/app/actions/judge";
import { getMyProfile } from "@/app/actions/profile";
import { getRegistrationWindow } from "@/app/actions/registration-window";
import { getResultsPublication } from "@/app/actions/results";
import { getVerificationTeams } from "@/app/actions/verification";
import { TeamsBrowser } from "@/components/admin/teams-browser";
import { JudgeTeamsList } from "@/components/judge/judge-teams-list";
import { RegistrationWindowPanel } from "@/components/admin/registration-window-panel";
import { ResultsPanel } from "@/components/admin/results-panel";
import { VolunteerTeamsBrowser } from "@/components/volunteer/teams-browser";
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
          <p className="text-ignite-danger">{teamsResult.error}</p>
        )}
      </div>
    );
  }

  if (profile?.role === "volunteer") {
    const teamsResult = await getVerificationTeams();
    return (
      <div className="flex flex-col gap-4">
        <PageHeading
          title="Team verification"
          subtitle="Check each team's members and ID cards, then mark the team Verified or Ineligible."
        />
        {teamsResult.success ? (
          <VolunteerTeamsBrowser teams={teamsResult.teams} />
        ) : (
          <Panel className="py-10 text-center text-[14px] text-ignite-danger">{teamsResult.error}</Panel>
        )}
      </div>
    );
  }

  const [teamsResult, judgesResult, registrationWindow, results] = await Promise.all([
    getTeamsForAdmin(),
    getJudges(),
    getRegistrationWindow(),
    getResultsPublication(),
  ]);

  if (!teamsResult.success) {
    return <p className="text-ignite-danger">{teamsResult.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Registrations" />
      <RegistrationWindowPanel initial={registrationWindow} />
      {/* Admin and super-admin only — getResultsPublication() refuses anyone else. */}
      {results.success && <ResultsPanel initial={results.data} />}
      <TeamsBrowser teams={teamsResult.teams} judges={judgesResult.success ? judgesResult.judges : []} />
    </div>
  );
}
