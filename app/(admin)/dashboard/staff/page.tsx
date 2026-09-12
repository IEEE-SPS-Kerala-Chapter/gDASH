import { redirect } from "next/navigation";
import { getStaffAccounts } from "@/app/actions/admin";
import { getMyProfile } from "@/app/actions/profile";
import { StaffManager } from "@/components/admin/staff-manager";

export default async function StaffPage() {
  const profile = await getMyProfile();
  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const result = await getStaffAccounts();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Staff accounts</h1>
      {result.success ? <StaffManager staff={result.staff} /> : <p className="text-destructive">{result.error}</p>}
    </div>
  );
}
