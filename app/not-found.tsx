import Link from "next/link";
import { BrandLogo } from "@/components/registration/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
      <BrandLogo className="h-14" />
      <h1 className="font-heading text-2xl font-bold text-black">Page not found</h1>
      <p className="max-w-sm text-gignite-text/80">
        That page doesn&apos;t exist. Check the link, or head back to registration.
      </p>
      <Link href="/register" className="font-semibold text-gignite-blue hover:text-gignite-accent">
        Go to registration →
      </Link>
    </main>
  );
}
