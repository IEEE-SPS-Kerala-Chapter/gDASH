"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createStaffAccount, type StaffAccount } from "@/app/actions/admin";

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
        <Card className="border-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <p className="font-medium">Account created — share these with them yourself:</p>
              <p className="text-muted-foreground">
                {justCreated.email} / {justCreated.password}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyCredentials}>
                Copy
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setJustCreated(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Add a staff account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-name">Full name</Label>
                <Input id="staff-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-role">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="staff-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="judge">Judge</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-password">Temporary password</Label>
                <div className="flex gap-2">
                  <Input
                    id="staff-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                    Generate
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              There&apos;s no invite email yet — after creating the account, you&apos;ll need to send this email and
              password to them yourself.
            </p>
            <Button type="submit" disabled={submitting} className="w-fit">
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Existing staff ({staff.length})</span>
        <div className="flex flex-col divide-y rounded-md border bg-card">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{s.full_name}</div>
                <div className="text-muted-foreground">{s.email}</div>
              </div>
              <Badge variant="secondary" className="capitalize">
                {ROLE_LABELS[s.role] ?? s.role}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
