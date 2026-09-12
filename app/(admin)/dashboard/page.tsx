import { getTeamsForAdmin } from "@/app/actions/admin";
import { DashboardTable } from "@/components/admin/dashboard-table";

export default async function DashboardPage() {
  const result = await getTeamsForAdmin();

  if (!result.success) {
    return <p className="text-destructive">{result.error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Registrations</h1>
      <DashboardTable teams={result.teams} />
    </div>
  );
}
