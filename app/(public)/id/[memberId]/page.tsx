import { notFound } from "next/navigation";
import { checkMemberExists } from "@/app/actions/registration";
import { BrandLogo } from "@/components/registration/ui";

// Every gIGNITE ID card's QR code points here. For now this is a static
// placeholder — see id-card-future-phases.md for what eventually replaces
// it (results reveal, food-token check-in). A garbage/malicious id 404s via
// member_exists() rather than showing this page regardless of validity.
export default async function MemberIdPage({ params }: { params: { memberId: string } }) {
  const exists = await checkMemberExists(params.memberId);
  if (!exists) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gignite-bg p-8 text-center font-body text-gignite-text">
      <BrandLogo className="h-14" />
      <h1 className="font-heading text-2xl font-bold text-black">gIGNITE — Coming Soon</h1>
      <p className="max-w-sm text-gignite-text/80">
        This QR code will soon show your team&apos;s results and event check-in. Check back closer to the event.
      </p>
    </main>
  );
}
