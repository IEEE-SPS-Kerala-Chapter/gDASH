"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Field, GradientText, HeroShell, TextInput, PrimaryButton, LogoHeaderBar } from "@/components/admin/ui";
import { signIn, startStaffGoogleSignIn } from "@/app/actions/auth";
import { GoogleIcon } from "@/components/registration/leader-sign-in";

// Set by the Google callback (app/(admin)/login/google/callback/route.ts).
const GOOGLE_ERRORS: Record<string, string> = {
  not_staff:
    "That Google account isn't a staff account. Use the Google account with the email the super-admin added for you, or sign in with your password.",
  failed: "Google sign-in didn't go through. Please try again.",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Read once on arrival, without useSearchParams (which would need a
  // Suspense boundary around this whole page).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("google");
    if (reason) setGoogleError(GOOGLE_ERRORS[reason] ?? GOOGLE_ERRORS.failed);
  }, []);

  async function handleGoogle() {
    setGoogleLoading(true);
    setGoogleError(null);
    const result = await startStaffGoogleSignIn().catch(() => ({ success: false as const }));
    if (!result.success) {
      setGoogleLoading(false);
      setGoogleError(GOOGLE_ERRORS.failed);
      return;
    }
    // Stays in the loading state until Google's page replaces this one.
    window.location.assign(result.url);
  }

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
            {googleError && (
              <p role="alert" className="m-0 rounded-xl bg-ignite-danger-pale px-4 py-2.5 text-sm text-ignite-danger">
                {googleError}
              </p>
            )}
            <PrimaryButton
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              loading={googleLoading}
              // White in dark mode (Google's own sign-in button style).
              className="dark:bg-white dark:text-[#1f1f1f] dark:hover:bg-neutral-200"
            >
              {!googleLoading && <GoogleIcon />}
              {googleLoading ? "Redirecting…" : "Sign in with Google"}
            </PrimaryButton>
            <div className="flex items-center gap-3 font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-ignite-faint">
              <span className="h-px flex-1 bg-ignite-edge/[0.07]" />
              or with your password
              <span className="h-px flex-1 bg-ignite-edge/[0.07]" />
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
                <div className="relative">
                  <TextInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ignite-faint transition-colors hover:text-ignite-ink focus-visible:text-ignite-ink focus-visible:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
