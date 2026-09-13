import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-gignite-divider", className)} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-gignite-border bg-gignite-surface p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
