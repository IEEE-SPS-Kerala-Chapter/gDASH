import { GridBackground, Skeleton } from "@/components/registration/ui";

export default function ResetPasswordLoading() {
  return (
    <main className="relative flex min-h-[calc(100vh-88px)] flex-col items-center justify-center gap-8 bg-gignite-bg p-4 font-body text-gignite-text">
      <GridBackground />
      <Skeleton className="relative z-10 h-16 w-40" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-black/[0.08] bg-gignite-surface p-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full rounded-[11px]" />
      </div>
    </main>
  );
}
