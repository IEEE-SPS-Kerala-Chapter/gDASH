"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetOwnPassword, signOut } from "@/app/actions/auth";
import { Field, FormCard, PrimaryButton, SecondaryButton, TextInput } from "@/components/admin/ui";

export function ResetPasswordForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    const result = await resetOwnPassword({ newPassword, confirmPassword });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Password updated.");
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <FormCard>
      <div className="flex flex-col gap-[6px]">
        <h1 className="m-0 font-heading text-[20px] font-bold text-black">Set a new password</h1>
        <p className="m-0 text-[14px] text-gignite-text/70">
          For security, you need to set your own password before continuing.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="New password" hint="At least 8 characters.">
          <TextInput
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <TextInput
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <PrimaryButton type="submit" disabled={submitting || signingOut} loading={submitting}>
          {submitting ? "Saving…" : "Set password"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={handleSignOut} disabled={submitting || signingOut}>
          {signingOut ? "Signing out…" : "Sign out instead"}
        </SecondaryButton>
      </form>
    </FormCard>
  );
}
