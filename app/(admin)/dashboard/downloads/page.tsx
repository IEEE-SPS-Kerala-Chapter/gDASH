import { redirect } from "next/navigation";
import { getMyProfile } from "@/app/actions/profile";
import { createClient } from "@/lib/supabase/server";
import { TeamDownloads } from "@/components/admin/team-downloads";
import { PageHeading } from "@/components/admin/ui";
import { isAdminLevelRole } from "@/lib/roles";

export default async function TeamDownloadsPage() {
  const profile = await getMyProfile();
  if (!profile || !isAdminLevelRole(profile.role)) {
    redirect("/dashboard");
  }

  // The finale shortlist downloads unlock once results are published.
  const supabase = await createClient();
  const { data: publication } = await supabase.from("results_publication").select("is_published").eq("id", true).maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Team Details Downloads" />
      <TeamDownloads resultsPublished={Boolean(publication?.is_published)} />
    </div>
  );
}
