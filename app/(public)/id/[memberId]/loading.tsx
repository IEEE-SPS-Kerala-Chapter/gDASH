import { Skeleton } from "@/components/registration/ui";

export default function MemberIdLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center">
      <Skeleton className="h-14 w-36" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-72" />
    </main>
  );
}
