"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createStaffAccount, deleteStaffAccount, type StaffAccount } from "@/app/actions/admin";
import { Badge, Field, FormCard, Panel, PrimaryButton, SecondaryButton, SectionLabel, Select, TextInput } from "@/components/admin/ui";
import { ROLE_LABELS } from "@/lib/roles";

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(): string {
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

export function StaffManager({ staff: initialStaff }: { staff: StaffAccount[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("judge");
  const [password, setPassword] = useState(() => generatePassword());
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<StaffAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    const result = await createStaffAccount({ email, fullName, role, password });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setJustCreated({ email, password });
    setStaff((prev) => [result.account, ...prev]);
    setFullName("");
    setEmail("");
    setRole("judge");
    setPassword(generatePassword());
    toast.success("Account created.");
  }

  async function handleConfirmedDelete() {
    if (!confirmingDelete) return;
    const target = confirmingDelete;
    setDeleting(true);
    const result = await deleteStaffAccount(target.id);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setStaff((prev) => prev.filter((s) => s.id !== target.id));
    setConfirmingDelete(null);
    toast.success("Account deleted.");
  }

  async function copyCredentials() {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(`Email: ${justCreated.email}\nPassword: ${justCreated.password}`);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {justCreated && (
        <Panel className="border-ignite-ink/40">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[14px]">
            <div>
              <p className="m-0 font-semibold text-ignite-ink">Account created — share these with them yourself:</p>
              <p className="m-0 text-ignite-muted">
                {justCreated.email} / {justCreated.password}
              </p>
            </div>
            <div className="flex gap-2">
              <SecondaryButton type="button" onClick={copyCredentials}>
                Copy
              </SecondaryButton>
              <SecondaryButton type="button" onClick={() => setJustCreated(null)}>
                Dismiss
              </SecondaryButton>
            </div>
          </div>
        </Panel>
      )}

      <FormCard>
        <h2 className="m-0 font-display text-[19px] font-bold text-ignite-ink">Add a staff account</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <TextInput required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="judge">Judge</option>
                <option value="volunteer">Volunteer</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Temporary password">
              <div className="flex gap-2">
                <TextInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <SecondaryButton type="button" onClick={() => setPassword(generatePassword())}>
                  Generate
                </SecondaryButton>
              </div>
            </Field>
          </div>
          <p className="m-0 text-[13px] text-ignite-muted">
            There&apos;s no invite email yet — after creating the account, you&apos;ll need to send this email and
            password to them yourself.
          </p>
          <div className="w-fit">
            <PrimaryButton type="submit" disabled={submitting} loading={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </PrimaryButton>
          </div>
        </form>
      </FormCard>

      <div className="flex flex-col gap-2">
        <SectionLabel>Existing staff ({staff.length})</SectionLabel>
        <Panel className="flex flex-col divide-y divide-ignite-edge/[0.07]">
          {staff.map((s) => (
            <div key={s.id} className="flex flex-col gap-3 p-3 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ignite-ink">{s.full_name}</div>
                  <div className="text-ignite-muted">{s.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{ROLE_LABELS[s.role] ?? s.role}</Badge>
                  {/* Super-admin accounts can't be deleted here at all — the
                      server rejects it too (see deleteStaffAccount), this
                      just avoids offering a button that would always fail. */}
                  {s.role !== "super_admin" && (
                    <button
                      type="button"
                      aria-label={`Delete ${s.full_name}`}
                      onClick={() => setConfirmingDelete(s)}
                      className="rounded-[7px] border-[1.5px] border-ignite-danger/50 px-2.5 py-1 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ignite-danger transition-colors hover:border-ignite-danger hover:bg-ignite-danger hover:text-white"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {confirmingDelete?.id === s.id && (
                <div className="flex flex-col gap-3 rounded-[10px] border-[1.5px] border-ignite-danger bg-ignite-bg p-4">
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-ignite-danger text-[11px] font-bold text-white">
                      !
                    </span>
                    <span className="flex-1 text-[14px] leading-[1.55] text-ignite-ink-soft">
                      Permanently delete <span className="font-semibold text-ignite-ink">{s.full_name}</span>&apos;s{" "}
                      {ROLE_LABELS[s.role] ?? s.role} account?{" "}
                      {s.role === "judge"
                        ? "Any scores they've already submitted are deleted with it, not just the account."
                        : "This cannot be undone."}
                    </span>
                  </div>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleConfirmedDelete}
                      disabled={deleting}
                      className="flex-1 rounded-[9px] bg-ignite-danger px-4 py-2.5 font-display text-[14px] font-medium text-white transition-colors hover:bg-ignite-danger/85 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleting ? "Deleting…" : "Delete account"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      disabled={deleting}
                      className="flex-1 rounded-[9px] border-[1.5px] border-ignite-edge/[0.18] bg-ignite-surface px-4 py-2.5 font-display text-[14px] font-medium text-ignite-ink-soft transition-colors hover:border-ignite-ink hover:text-ignite-ink"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
