import Link from "next/link";
import { BrandLogo } from "@/components/registration/ui";
import { getAppSurface } from "@/lib/app-surface";

export default function NotFound() {
  // The staff site has no registration pages, so point staff back to sign-in.
  const staff = getAppSurface() === "staff";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center font-ui text-ignite-ink-soft">
      <BrandLogo className="h-14" />
      <h1 className="font-display text-2xl font-bold text-ignite-ink">Page not found</h1>
      <p className="max-w-sm text-ignite-muted">
        That page doesn&apos;t exist. Check the link, or head back to {staff ? "staff sign-in" : "registration"}.
      </p>
      <Link href={staff ? "/login" : "/register"} className="font-semibold text-ignite-ink hover:text-ignite-magenta">
        {staff ? "Go to staff sign-in →" : "Go to registration →"}
      </Link>
    </main>
  );
}
