"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
      <h1 className="font-heading text-2xl font-bold text-black">Something went wrong</h1>
      <p className="max-w-sm text-gignite-text/80">
        That&apos;s on us, not you. Your form data hasn&apos;t been lost — try again, and if it
        keeps happening, let the organizers know.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-[11px] bg-gignite-accent px-6 py-3 font-heading font-bold text-black shadow-[0_3px_0_rgba(150,67,11,0.45)] hover:bg-gignite-accent-hover"
      >
        Try again
      </button>
    </main>
  );
}
