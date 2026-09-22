"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateRegistrationWindow, type RegistrationWindow } from "@/app/actions/registration-window";
import { Badge, Field, FormCard, PrimaryButton, Switch, TextArea, TextInput } from "@/components/admin/ui";

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Admin-only control for opening/closing registration (see
 * supabase/migrations/20260921020000_registration_window.sql). This panel
 * only ever controls the one row submit_registration() itself reads on
 * every call — that function is the real guarantee, not this UI.
 */
export function RegistrationWindowPanel({ initial }: { initial: RegistrationWindow }) {
  const [isOpen, setIsOpen] = useState(initial.isOpen);
  const [closesAtInput, setClosesAtInput] = useState(isoToLocalInput(initial.closesAt));
  const [closedMessage, setClosedMessage] = useState(initial.closedMessage ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateRegistrationWindow({
      isOpen,
      closesAt: localInputToIso(closesAtInput),
      closedMessage: closedMessage.trim() || null,
    });
    setSaving(false);
    if (result.success) {
      toast.success("Registration window updated.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <FormCard>
      <h2 className="m-0 font-heading text-[19px] font-bold text-black">Registration window</h2>
      <p className="m-0 text-[13px] text-gignite-text/60">
        Controls whether new teams can submit at /register. A scheduled closing date takes effect on
        its own — no need to flip the toggle at the exact time.
      </p>

      <Field label="Status">
        <div className="flex items-center gap-3">
          <Switch checked={isOpen} onChange={setIsOpen} ariaLabel="Registration open" />
          <Badge variant={isOpen ? "success" : "danger"}>{isOpen ? "Open" : "Closed"}</Badge>
        </div>
      </Field>

      <Field label="Closes at (optional)" hint="Leave blank for no scheduled closing date. Your local time.">
        <TextInput type="datetime-local" value={closesAtInput} onChange={(e) => setClosesAtInput(e.target.value)} />
      </Field>

      <Field
        label="Closed message (optional)"
        hint="Shown to participants at /register once closed. A sensible default is used if left blank."
      >
        <TextArea
          rows={2}
          value={closedMessage}
          onChange={(e) => setClosedMessage(e.target.value)}
          placeholder="Registration for gIGNITE 2026 is no longer open."
        />
      </Field>

      <div className="w-fit">
        <PrimaryButton type="button" onClick={handleSave} disabled={saving} loading={saving}>
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </div>
    </FormCard>
  );
}
