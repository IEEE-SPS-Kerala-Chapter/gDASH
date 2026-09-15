import { redirect } from "next/navigation";
import { getMyProfile } from "@/app/actions/profile";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";
import { PageHeading } from "@/components/admin/ui";

export default async function AuditLogsPage() {
  const profile = await getMyProfile();
  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        title="Audit logs"
        subtitle="Every registration, score, and staff action across the platform."
      />
      <AuditLogViewer />
    </div>
  );
}
