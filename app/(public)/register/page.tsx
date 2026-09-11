import { RegistrationWizard } from "@/components/registration/registration-wizard";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text">
      <div className="mx-auto mb-8 flex max-w-[460px] flex-col gap-2">
        <div className="flex items-center gap-[11px]">
          <div className="h-[13px] w-[13px] rounded-[3px] bg-gignite-accent" />
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-gignite-blue">
            gIGNITE · Team registration
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
