"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field, GradientText, HeroShell, TextInput, PrimaryButton, LogoHeaderBar } from "@/components/admin/ui";
import { signIn } from "@/app/actions/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    const result = await signIn({ email, password });

    if (!result.success) {
      setLoading(false);
      toast.error(result.error);
      return;
    }
    // Stays in the loading state until the dashboard replaces this page —
    // resetting here left an idle "Sign in" button on screen while the
    // dashboard loaded, which looked like nothing had happened.
    setOpening(true);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <LogoHeaderBar onHero />
      <HeroShell
        label="Staff access"
        title={
          <>
            Staff <GradientText>sign-in.</GradientText>
          </>
        }
        intro={<p className="m-0">For organizers, judges, and volunteers only.</p>}
      >
        <div className="flex flex-col gap-5">
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
              <PrimaryButton type="submit" disabled={loading} loading={loading}>
                {opening ? "Opening dashboard…" : loading ? "Signing in…" : "Sign in"}
              </PrimaryButton>
            </form>
        </div>
      </HeroShell>
    </>
  );
}
