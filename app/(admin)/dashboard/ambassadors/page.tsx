import { redirect } from "next/navigation";
import { getAmbassadorRanking } from "@/app/actions/ambassadors";
import { getMyProfile } from "@/app/actions/profile";
import { AmbassadorsManager } from "@/components/admin/ambassadors-manager";
import { PageHeading } from "@/components/admin/ui";
import { isAdminLevelRole } from "@/lib/roles";

export default async function AmbassadorsPage() {
  const profile = await getMyProfile();
  if (!profile || !isAdminLevelRole(profile.role)) {
    redirect("/dashboard");
  }

  const result = await getAmbassadorRanking();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Ambassadors" subtitle="Referral IDs AMGIG-01 onwards, ranked by the registrations each ambassador referred." />
      {result.success ? <AmbassadorsManager ranking={result.ranking} canManage={profile.role === "super_admin"} /> : <p className="text-ignite-danger">{result.error}</p>}
    </div>
  );
}
