import { Skeleton } from "@/components/registration/ui";

export default function StatusLoading() {
  return (
    <main className="min-h-screen bg-ignite-bg px-4 py-10 font-ui text-ignite-ink-soft">
      <div className="mx-auto flex max-w-[460px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-4 rounded-[24px] border border-ignite-edge/[0.08] bg-ignite-surface p-6 shadow-[0_16px_34px_rgba(32,65,154,0.09)]">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
          <div className="flex flex-col gap-2 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-[18px]" />
      </div>
    </main>
  );
}
