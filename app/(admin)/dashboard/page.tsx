import { getJudges, getRegistrationStats, listAdminTeams } from "@/app/actions/admin";
import { getMyAssignedTeams } from "@/app/actions/judge";
import { getMyProfile } from "@/app/actions/profile";
import { getRegistrationWindow } from "@/app/actions/registration-window";
import { getResultsPublication } from "@/app/actions/results";
import { getVerificationTeamPage } from "@/app/actions/verification";
import { TeamsBrowser } from "@/components/admin/teams-browser";
import { JudgeTeamsList } from "@/components/judge/judge-teams-list";
import { RegistrationWindowPanel } from "@/components/admin/registration-window-panel";
import { ResultsPanel } from "@/components/admin/results-panel";
import { VolunteerTeamsBrowser } from "@/components/volunteer/teams-browser";
import { PageHeading, Panel } from "@/components/admin/ui";
import { pageSizeFrom } from "@/lib/page-size";

// Team lists load 30 at a time (more as you scroll); ?pageSize=N changes
// that, e.g. to test scrolling on pre-prod with only a few teams.
export default async function DashboardPage(props: { searchParams: Promise<{ pageSize?: string }> }) {
  const pageSize = pageSizeFrom((await props.searchParams).pageSize);
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
    const teamsResult = await getVerificationTeamPage({ limit: pageSize });
    return (
      <div className="flex flex-col gap-4">
        <PageHeading
          title="Team verification"
          subtitle="Check each team's members and ID cards, then mark the team Verified or Ineligible."
        />
        {teamsResult.success ? (
          <VolunteerTeamsBrowser
            initialTeams={teamsResult.teams}
            initialTotal={teamsResult.total}
            initialCounts={teamsResult.counts}
            pageSize={pageSize}
          />
        ) : (
          <Panel className="py-10 text-center text-[14px] text-ignite-danger">{teamsResult.error}</Panel>
        )}
      </div>
    );
  }

  const [teamsResult, statsResult, judgesResult, registrationWindow, results] = await Promise.all([
    listAdminTeams({ limit: pageSize }),
    getRegistrationStats(),
    getJudges(),
    getRegistrationWindow(),
    getResultsPublication(),
  ]);

  if (!teamsResult.success) {
    return <p className="text-ignite-danger">{teamsResult.error}</p>;
  }
  if (!statsResult.success) {
    return <p className="text-ignite-danger">{statsResult.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Registrations" />
      <RegistrationWindowPanel initial={registrationWindow} />
      {/* Admin and super-admin only — getResultsPublication() refuses anyone else. */}
      {results.success && <ResultsPanel initial={results.data} />}
      <TeamsBrowser
        initialTeams={teamsResult.teams}
        initialTotal={teamsResult.total}
        initialStats={statsResult.stats}
        judges={judgesResult.success ? judgesResult.judges : []}
        pageSize={pageSize}
      />
    </div>
  );
}
