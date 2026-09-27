import { redirect } from "next/navigation";
import { getAttendance, getAttendanceSummary } from "@/app/actions/attendance";
import { getMyProfile } from "@/app/actions/profile";
import { AttendanceSummary } from "@/components/attendance/summary";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { AttendanceLiveRefresh } from "@/components/attendance/live-refresh";
import { PageHeading, SectionLabel } from "@/components/admin/ui";
import { isAdminLevelRole } from "@/lib/roles";

// Volunteers see the counts; admins also see every participant, can correct
// records and export. Only shortlisted teams are counted.
export default async function AttendancePage() {
  const profile = await getMyProfile();
  if (!profile || !["volunteer", "admin", "super_admin"].includes(profile.role)) {
    redirect("/dashboard");
  }
  const isAdmin = isAdminLevelRole(profile.role);

  const [summary, detail] = await Promise.all([
    getAttendanceSummary(),
    isAdmin ? getAttendance() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <AttendanceLiveRefresh />
      <PageHeading title="Attendance" subtitle="Venue check-in and meals for shortlisted participants. Updates every 15 seconds." />
      {summary.success ? (
        <AttendanceSummary items={summary.items} />
      ) : (
        <p className="text-ignite-danger">{summary.error}</p>
      )}
      {detail &&
        (detail.success ? (
          <div className="flex flex-col gap-3">
            <SectionLabel>Participants</SectionLabel>
            <AttendanceTable data={detail.data} />
          </div>
        ) : (
          <p className="text-ignite-danger">{detail.error}</p>
        ))}
    </div>
  );
}
