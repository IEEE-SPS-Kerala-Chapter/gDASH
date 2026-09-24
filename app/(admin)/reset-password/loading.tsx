import { GridBackground, Skeleton } from "@/components/admin/ui";

export default function ResetPasswordLoading() {
  return (
    <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-8 bg-ignite-bg p-4 font-ui text-ignite-ink-soft">
      <GridBackground />
      <Skeleton className="relative z-10 h-16 w-40" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-ignite-edge/[0.08] bg-ignite-surface p-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full rounded-[11px]" />
      </div>
    </main>
  );
}
