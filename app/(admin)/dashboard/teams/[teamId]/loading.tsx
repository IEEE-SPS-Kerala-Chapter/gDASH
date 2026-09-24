import { Skeleton } from "@/components/admin/ui";

export default function TeamDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      <div className="flex items-center justify-between gap-3 border-b border-ignite-edge/[0.07] pb-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-32 rounded-[9px]" />
      </div>
      <div className="flex items-start justify-between gap-8 border-b border-ignite-edge/[0.07] pb-6">
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
