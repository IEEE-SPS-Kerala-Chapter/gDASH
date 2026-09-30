import { redirect } from "next/navigation";
import { getAmbassadorRanking } from "@/app/actions/ambassadors";
import { getMyProfile } from "@/app/actions/profile";
import { AmbassadorsManager } from "@/components/admin/ambassadors-manager";
import { PageHeading } from "@/components/admin/ui";

export default async function AmbassadorsPage() {
  const profile = await getMyProfile();
  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const result = await getAmbassadorRanking();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Ambassadors" subtitle="Referral IDs AMGIG-00 onwards, ranked by the registrations each ambassador referred." />
      {result.success ? <AmbassadorsManager ranking={result.ranking} /> : <p className="text-ignite-danger">{result.error}</p>}
    </div>
  );
}
