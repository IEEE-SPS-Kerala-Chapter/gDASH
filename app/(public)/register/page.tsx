import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { BrandLogo } from "@/components/registration/ui";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
      <div className="mx-auto mb-8 flex max-w-[460px] flex-col gap-3 lg:hidden">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-8" />
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-gignite-blue">
            Team registration
          </span>
        </div>
        <h1 className="m-0 font-heading text-[28px] font-bold tracking-[-0.025em] text-black">
          Team → Members → Idea → Declarations
        </h1>
      </div>
      <RegistrationWizard />
    </main>
  );
}
