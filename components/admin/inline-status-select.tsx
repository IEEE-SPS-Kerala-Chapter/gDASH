"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateRegistrationStatus } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  submitted: "",
  under_review: "border-transparent bg-amber-100 text-amber-800",
  shortlisted: "border-transparent bg-emerald-100 text-emerald-800",
  rejected: "border-transparent bg-red-100 text-red-800",
};

/**
 * Change a registration's status directly from a list row or card, without
 * navigating into the detail page. Stops click propagation so it can sit
 * inside a row/card that navigates on click elsewhere.
 */
export function InlineStatusSelect({
  registrationId,
  status,
  onChange,
}: {
  registrationId: string;
  status: string;
  onChange: (next: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleChange(next: string) {
    if (next === status) return;
    setBusy(true);
    const result = await updateRegistrationStatus(registrationId, next);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChange(next);
    toast.success("Status updated.");
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select disabled={busy} value={status} onValueChange={handleChange}>
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue>
            <Badge className={cn("text-[10px]", STATUS_STYLES[status])} variant="secondary">
              {STATUS_LABELS[status] ?? status}
            </Badge>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
