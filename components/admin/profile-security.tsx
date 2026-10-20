"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { disableMfa } from "@/app/actions/mfa";
import { Badge, Field, Panel, PrimaryButton, SecondaryButton, SectionLabel } from "@/components/admin/ui";
import { CodeInput, SetupStep } from "@/components/admin/two-factor";

/**
 * Profile → two-factor sign-in: turn it on (the same setup as at sign-in,
 * shown inline) or off (needs a current code). The super-admin must keep it
 * on. Server side: app/actions/mfa.ts.
 */
export function ProfileSecurity({
  email,
  enrolled,
  required,
  backupCodesLeft,
}: {
  email: string;
  enrolled: boolean;
  required: boolean;
  backupCodesLeft: number | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "enabling" | "disabling">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOff(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await disableMfa(value).catch(() => ({ success: false as const, error: "No connection — try again." }));
    setBusy(false);
    if (!result.success) {
      setCode("");
      setError(result.error);
      return;
    }
    toast.success("Two-factor sign-in is off. You can delete the gIGNITE Staff entry from your authenticator app.");
    setMode("idle");
    setCode("");
    router.refresh();
  }

  return (
    <Panel className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Two-factor sign-in</SectionLabel>
        <Badge variant={enrolled ? "success" : "neutral"}>{enrolled ? "On" : "Off"}</Badge>
      </div>

      {mode === "enabling" ? (
        <>
          <SetupStep
            email={email}
            doneLabel="Done"
            onDone={() => {
              setMode("idle");
              router.refresh();
            }}
          />
          <SecondaryButton type="button" onClick={() => setMode("idle")}>
            Cancel
          </SecondaryButton>
        </>
      ) : enrolled ? (
        <>
          <p className="m-0 text-[14px] leading-[1.55] text-ignite-muted">
            You enter a code from your authenticator app each time you sign in.
            {backupCodesLeft !== null && (
              <>
                {" "}
                {backupCodesLeft} unused backup code{backupCodesLeft === 1 ? "" : "s"} left.
              </>
            )}
          </p>
          {required ? (
            <p className="m-0 rounded-xl bg-ignite-lavender px-4 py-3 text-[13px] leading-[1.5] text-ignite-ink">
              Two-factor sign-in is required for the super-admin and can&apos;t be turned off.
            </p>
          ) : mode === "disabling" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void turnOff(code);
              }}
            >
              <Field label="Enter the current code from your app to turn it off" error={error ?? undefined}>
                <CodeInput value={code} onChange={setCode} onComplete={turnOff} disabled={busy} />
              </Field>
              <div className="flex flex-wrap gap-2.5">
                <div className="flex-1">
                  <PrimaryButton type="submit" disabled={busy || code.length !== 6} loading={busy}>
                    {busy ? "Turning off…" : "Turn off two-factor sign-in"}
                  </PrimaryButton>
                </div>
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setCode("");
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </SecondaryButton>
              </div>
            </form>
          ) : (
            <div>
              <SecondaryButton type="button" onClick={() => setMode("disabling")}>
                Turn off
              </SecondaryButton>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="m-0 text-[14px] leading-[1.55] text-ignite-muted">
            Your account opens with your password alone. Turn on two-factor sign-in to also need a 6-digit code from an
            authenticator app on your phone — so someone who learns your password still can&apos;t get in.
          </p>
          <div className="max-w-[320px]">
            <PrimaryButton type="button" onClick={() => setMode("enabling")}>
              Turn on two-factor sign-in
            </PrimaryButton>
          </div>
        </>
      )}
    </Panel>
  );
}
