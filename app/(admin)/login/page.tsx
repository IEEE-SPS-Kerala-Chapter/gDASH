"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandLogo, FormCard, Field, TextInput, PrimaryButton, GridBackground } from "@/components/admin/ui";
import { signIn } from "@/app/actions/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    const result = await signIn({ email, password });
    setLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-gignite-bg p-4 font-body text-gignite-text">
      <GridBackground />
      <BrandLogo className="relative z-10 h-16" />
      <div className="relative z-10 w-full max-w-sm">
        <FormCard>
          <div className="flex flex-col gap-[6px]">
            <h1 className="m-0 font-heading text-[20px] font-bold text-black">Staff sign-in</h1>
            <p className="m-0 text-[14px] text-gignite-text/70">For organizers, judges, and volunteers only.</p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email">
              <TextInput
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Password">
              <TextInput
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryButton>
          </form>
        </FormCard>
      </div>
    </main>
  );
}
