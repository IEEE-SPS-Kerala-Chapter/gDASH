import { redirect } from "next/navigation";
import { getStaffAccounts } from "@/app/actions/admin";
import { getMyProfile } from "@/app/actions/profile";
import { StaffManager } from "@/components/admin/staff-manager";
import { PageHeading } from "@/components/admin/ui";

export default async function StaffPage() {
  const profile = await getMyProfile();
  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const result = await getStaffAccounts();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Staff accounts" />
      {result.success ? <StaffManager staff={result.staff} /> : <p className="text-gignite-danger">{result.error}</p>}
    </div>
  );
}
