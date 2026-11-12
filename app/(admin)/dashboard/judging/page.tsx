import { redirect } from "next/navigation";
import { getMyProfile } from "@/app/actions/profile";
import { getJudgingOverview } from "@/app/actions/judging";
import { JudgingStats } from "@/components/admin/judging-stats";
import { PageHeading, Panel } from "@/components/admin/ui";
import { isAdminLevelRole } from "@/lib/roles";

export default async function JudgingPage() {
  const profile = await getMyProfile();
  if (!profile || !isAdminLevelRole(profile.role)) {
    redirect("/dashboard");
  }
  const overview = await getJudgingOverview();
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Judging"
        subtitle="Every judge with the teams assigned to them, how far scoring has got, and what needs attention."
      />
      {overview.success ? (
        <JudgingStats teams={overview.teams} judges={overview.judges} />
      ) : (
        <Panel className="py-10 text-center text-[14px] text-ignite-danger">{overview.error}</Panel>
      )}
    </div>
  );
}
