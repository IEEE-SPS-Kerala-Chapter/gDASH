"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmTotpSetup, redeemBackupCode, startTotpSetup, verifyTotp } from "@/app/actions/mfa";
import { signOut } from "@/app/actions/auth";
import { Field, PrimaryButton, SecondaryButton, Spinner, TextInput } from "@/components/admin/ui";

type Mode = "setup" | "verify" | "backup";

/**
 * Staff 2FA step after the password (app/(admin)/login/2fa/page.tsx):
 * first-time setup of an authenticator app (QR → first code → backup
 * codes), or the 6-digit code on every later sign-in, with a backup-code
 * route for a lost phone. Server side: app/actions/mfa.ts.
 */
export function TwoFactor({ initialMode, email }: { initialMode: "setup" | "verify"; email: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signingOut, setSigningOut] = useState(false);

  function goToDashboard() {
    router.replace("/dashboard");
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {mode === "setup" && <SetupStep email={email} onDone={goToDashboard} />}
      {mode === "verify" && <VerifyStep onDone={goToDashboard} onUseBackup={() => setMode("backup")} />}
      {mode === "backup" && (
        <BackupStep
          onRedeemed={() => {
            toast.success("Backup code accepted. Set up your authenticator app again.");
            setMode("setup");
          }}
          onBack={() => setMode("verify")}
        />
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="self-center font-ui text-[13px] font-semibold text-ignite-muted underline-offset-4 hover:text-ignite-ink hover:underline disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Heading({ title, text }: { title: string; text: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h1 className="m-0 font-display text-[20px] font-bold text-ignite-ink">{title}</h1>
      <p className="m-0 text-[14px] leading-[1.55] text-ignite-muted">{text}</p>
    </div>
  );
}

/** Six-digit code input; submits on its own once all six digits are in. */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean }) {
  return (
    <TextInput
      autoFocus
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="123456"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(digits);
        if (digits.length === 6) onComplete(digits);
      }}
      className="text-center font-display text-[22px] tracking-[0.4em]"
      aria-label="6-digit code"
    />
  );
}

function VerifyStep({ onDone, onUseBackup }: { onDone: () => void; onUseBackup: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyTotp(value).catch(() => ({ success: false as const, error: "No connection — try again." }));
    if (result.success) {
      onDone();
      return;
    }
    setBusy(false);
    setCode("");
    setError(result.error);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <Heading title="Enter your code" text="Open your authenticator app and enter the 6-digit code for gIGNITE Staff." />
      <Field label="6-digit code" error={error ?? undefined}>
        <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} />
      </Field>
      <PrimaryButton type="submit" disabled={busy || code.length !== 6} loading={busy}>
        {busy ? "Checking…" : "Continue"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onUseBackup}
        className="self-center font-ui text-[13px] font-semibold text-ignite-ink-soft underline-offset-4 hover:text-ignite-ink hover:underline"
      >
        Lost your phone? Use a backup code
      </button>
    </form>
  );
}

function BackupStep({ onRedeemed, onBack }: { onRedeemed: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await redeemBackupCode(code).catch(() => ({ success: false as const, error: "No connection — try again." }));
    setBusy(false);
    if (result.success) {
      onRedeemed();
      return;
    }
    setError(result.error);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Heading
        title="Use a backup code"
        text="Enter one of the backup codes you saved when you set up two-factor sign-in. It removes your old authenticator, and you'll set up a new one next. Each code works once."
      />
      <Field label="Backup code" error={error ?? undefined}>
        <TextInput
          autoFocus
          autoComplete="off"
          placeholder="ABCDE-FGH23"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="text-center font-display tracking-[0.2em]"
        />
      </Field>
      <PrimaryButton type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 10} loading={busy}>
        {busy ? "Checking…" : "Use backup code"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onBack}
        className="self-center font-ui text-[13px] font-semibold text-ignite-ink-soft underline-offset-4 hover:text-ignite-ink hover:underline"
      >
        ← Back to the code from my app
      </button>
      <p className="m-0 text-center text-[12px] text-ignite-muted">No backup codes either? Ask the super-admin to reset your two-factor sign-in.</p>
    </form>
  );
}

function SetupStep({ email, onDone }: { email: string; onDone: () => void }) {
  const [enrolment, setEnrolment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const started = useRef(false);

  async function begin() {
    setLoadError(null);
    const result = await startTotpSetup().catch(() => ({ success: false as const, error: "No connection — try again." }));
    if (result.success) setEnrolment(result);
    else setLoadError(result.error);
  }

  useEffect(() => {
    // Once per mount (React may run effects twice in development).
    if (started.current) return;
    started.current = true;
    void begin();
  }, []);

  async function submit(value: string) {
    if (!enrolment || busy) return;
    setBusy(true);
    setError(null);
    const result = await confirmTotpSetup(enrolment.factorId, value).catch(() => ({
      success: false as const,
      error: "No connection — try again.",
    }));
    setBusy(false);
    if (result.success) {
      if (result.backupCodes.length === 0) {
        toast.message("Two-factor sign-in is on, but backup codes couldn't be created. Ask the super-admin if you ever lose your phone.");
        onDone();
        return;
      }
      setBackupCodes(result.backupCodes);
      return;
    }
    setCode("");
    setError(result.error);
  }

  if (backupCodes) return <BackupCodes codes={backupCodes} email={email} onDone={onDone} />;

  return (
    <div className="flex flex-col gap-4">
      <Heading
        title="Set up two-factor sign-in"
        text="Staff accounts need a code from an authenticator app at every sign-in — so a password alone can't open the dashboard."
      />
      <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-[1.55] text-ignite-ink-soft">
        <li>Install an authenticator app on your phone — Google Authenticator, Microsoft Authenticator or Authy.</li>
        <li>In the app, add an account and scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>

      {loadError ? (
        <div className="flex flex-col gap-2 rounded-xl border border-ignite-danger/40 p-4 text-[14px] text-ignite-danger">
          {loadError}
          <SecondaryButton type="button" onClick={begin}>
            Try again
          </SecondaryButton>
        </div>
      ) : !enrolment ? (
        <div className="flex h-[200px] items-center justify-center text-ignite-muted">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="flex justify-center">
            {/* The QR is an SVG data URL from Supabase. White backing so it scans in dark mode too. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolment.qrCode} alt="QR code to add gIGNITE Staff to your authenticator app" className="h-[190px] w-[190px] rounded-xl bg-white p-2.5" />
          </div>
          {showKey ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-[12px] text-ignite-muted">Enter this key in the app (time-based):</span>
              <code className="break-all rounded-lg bg-ignite-bg px-3 py-2 font-mono text-[14px] tracking-[0.08em] text-ignite-ink">{enrolment.secret}</code>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowKey(true)}
              className="self-center font-ui text-[13px] font-semibold text-ignite-ink-soft underline-offset-4 hover:text-ignite-ink hover:underline"
            >
              Can&apos;t scan? Enter a key instead
            </button>
          )}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(code);
            }}
          >
            <Field label="6-digit code from the app" error={error ?? undefined}>
              <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} />
            </Field>
            <PrimaryButton type="submit" disabled={busy || code.length !== 6} loading={busy}>
              {busy ? "Checking…" : "Turn on two-factor sign-in"}
            </PrimaryButton>
          </form>
        </>
      )}
    </div>
  );
}

function BackupCodes({ codes, email, onDone }: { codes: string[]; email: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `gIGNITE Staff — backup codes for ${email}\nEach code works once. Use one if you lose your phone.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy — select the codes and copy them manually.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gignite-staff-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Heading
        title="Save your backup codes"
        text="If you lose your phone, one of these gets you back in. Each works once. Keep them somewhere safe — they won't be shown again."
      />
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-ignite-bg p-4 font-mono text-[15px] tracking-[0.06em] text-ignite-ink">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={copy}>
          Copy
        </SecondaryButton>
        <SecondaryButton type="button" onClick={download}>
          Download .txt
        </SecondaryButton>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ignite-ink-soft">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4" />
        I&apos;ve saved these codes somewhere safe
      </label>
      <PrimaryButton type="button" disabled={!saved} onClick={onDone}>
        Continue to dashboard
      </PrimaryButton>
    </div>
  );
}
