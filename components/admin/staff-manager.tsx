"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createStaffAccount, type StaffAccount } from "@/app/actions/admin";
import { Badge, Field, FormCard, Panel, PrimaryButton, SecondaryButton, SectionLabel, Select, TextInput } from "@/components/admin/ui";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", judge: "Judge", volunteer: "Volunteer" };

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
    setStaff((prev) => [
      { id: crypto.randomUUID(), full_name: fullName, email, role, created_at: new Date().toISOString() },
      ...prev,
    ]);
    setFullName("");
    setEmail("");
    setRole("judge");
    setPassword(generatePassword());
    toast.success("Account created.");
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
        <Panel className="border-gignite-blue/40">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[14px]">
            <div>
              <p className="m-0 font-semibold text-black">Account created — share these with them yourself:</p>
              <p className="m-0 text-gignite-text/70">
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
        <h2 className="m-0 font-heading text-[19px] font-bold text-black">Add a staff account</h2>
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
          <p className="m-0 text-[13px] text-gignite-text/60">
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
        <Panel className="flex flex-col divide-y divide-gignite-divider">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-3 text-[14px]">
              <div>
                <div className="font-semibold text-black">{s.full_name}</div>
                <div className="text-gignite-text/70">{s.email}</div>
              </div>
              <Badge>{ROLE_LABELS[s.role] ?? s.role}</Badge>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
