import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { BrandLogo } from "@/components/registration/ui";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gignite-bg px-4 py-10 font-body text-gignite-text lg:px-16 lg:py-16">
      <div className="mx-auto mb-6 flex max-w-[460px] justify-center lg:hidden">
        <BrandLogo className="h-14" />
      </div>
      <RegistrationWizard />
    </main>
  );
}
