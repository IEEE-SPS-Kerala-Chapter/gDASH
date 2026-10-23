import { Skeleton } from "@/components/admin/ui";

export default function TeamDownloadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-col gap-2 rounded-2xl border border-ignite-edge/[0.12] bg-ignite-surface p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
