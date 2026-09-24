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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ignite-bg p-8 text-center font-ui text-ignite-ink-soft">
      <h1 className="font-display text-2xl font-bold text-ignite-ink">Something went wrong</h1>
      <p className="max-w-sm text-ignite-muted">
        That&apos;s on us, not you. Your form data hasn&apos;t been lost — try again, and if it
        keeps happening, let the organizers know.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-ignite-primary px-7 py-3 font-ui font-bold text-ignite-on-primary shadow-[0_8px_20px_rgba(44,29,68,0.18)] hover:bg-ignite-primary-hover"
      >
        Try again
      </button>
    </main>
  );
}
