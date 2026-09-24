import Link from "next/link";
import { BrandLogo } from "@/components/registration/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center font-ui text-ignite-ink-soft">
      <BrandLogo className="h-14" />
      <h1 className="font-display text-2xl font-bold text-ignite-ink">Page not found</h1>
      <p className="max-w-sm text-ignite-muted">
        That page doesn&apos;t exist. Check the link, or head back to registration.
      </p>
      <Link href="/register" className="font-semibold text-ignite-ink hover:text-ignite-magenta">
        Go to registration →
      </Link>
    </main>
  );
}
