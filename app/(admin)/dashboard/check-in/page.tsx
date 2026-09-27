import { redirect } from "next/navigation";
import { getCheckpoints } from "@/app/actions/checkin";
import { getMyProfile } from "@/app/actions/profile";
import { CheckpointsPanel } from "@/components/checkin/checkpoints-panel";
import { PageHeading } from "@/components/admin/ui";
import { isAdminLevelRole } from "@/lib/roles";

export default async function CheckInSetupPage() {
  const profile = await getMyProfile();
  if (!profile || !isAdminLevelRole(profile.role)) {
    redirect("/dashboard");
  }

  const result = await getCheckpoints();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        title="Check-in setup"
        subtitle="Open venue check-in and meals for scanning on event day. Only shortlisted teams can be scanned."
      />
      {result.success ? <CheckpointsPanel checkpoints={result.checkpoints} /> : <p className="text-ignite-danger">{result.error}</p>}
    </div>
  );
}
