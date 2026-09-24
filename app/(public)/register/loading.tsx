import { GridBackground, Skeleton } from "@/components/registration/ui";

export default function RegisterLoading() {
  return (
    <main className="relative min-h-screen bg-ignite-bg px-4 py-10 font-ui text-ignite-ink-soft lg:px-16 lg:py-16">
      <GridBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-[460px] flex-col gap-10 lg:max-w-[1320px] lg:flex-row lg:items-start lg:gap-20">
        <div className="hidden w-[300px] flex-none flex-col gap-10 lg:flex">
          <Skeleton className="h-20 w-40" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
        <div className="flex w-full flex-col gap-5 rounded-[30px] border border-black/[0.08] bg-ignite-bg p-6 shadow-[0_18px_46px_rgba(44,44,44,0.13)] lg:flex-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-full" />
        </div>
      </div>
    </main>
  );
}
