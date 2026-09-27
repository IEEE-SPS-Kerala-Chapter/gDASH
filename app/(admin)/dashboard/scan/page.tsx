import { redirect } from "next/navigation";
import { getOpenCheckpoints } from "@/app/actions/checkin";
import { getMyProfile } from "@/app/actions/profile";
import { Scanner } from "@/components/checkin/scanner";
import { PageHeading } from "@/components/admin/ui";

// Event-day scanning (venue check-in and meals) — volunteers, admins and
// super-admins. Judges have no part in it.
export default async function ScanPage() {
  const profile = await getMyProfile();
  if (!profile || !["volunteer", "admin", "super_admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const result = await getOpenCheckpoints();

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Scan" subtitle="Scan a participant's ID-card QR code. Only shortlisted teams are accepted." />
      {result.success ? <Scanner checkpoints={result.checkpoints} /> : <p className="text-ignite-danger">{result.error}</p>}
    </div>
  );
}
