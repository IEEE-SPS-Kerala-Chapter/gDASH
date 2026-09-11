import { BrandLogo } from "@/components/registration/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center">
      <BrandLogo className="h-16 lg:h-24" />
      <p className="text-gignite-text/70">
        Hackathon registration platform — skeleton running. Landing page comes in Phase 4.
      </p>
    </main>
  );
}
