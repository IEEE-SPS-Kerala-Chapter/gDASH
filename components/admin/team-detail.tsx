"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminTeam, AdminJudge } from "@/app/actions/admin";
import { updateRegistrationStatus } from "@/app/actions/admin";
import { InlineJudgeAssign } from "./inline-judge-assign";
import { InlineDeckViewer } from "./inline-deck-viewer";

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

export function TeamDetail({ team: initialTeam, judges }: { team: AdminTeam; judges: AdminJudge[] }) {
  const [team, setTeam] = useState(initialTeam);
  const reg = team.registration;
  const leader = team.members.find((m) => m.is_leader);

  async function handleStatusChange(status: string) {
    if (!reg) return;
    const result = await updateRegistrationStatus(reg.id, status);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTeam((prev) =>
      prev.registration
        ? { ...prev, registration: { ...prev.registration, status: status as typeof prev.registration.status } }
        : prev,
    );
    toast.success("Status updated.");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-secondary-foreground hover:underline">
        ← Back to registrations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{team.name}</h1>
          <p className="text-muted-foreground">
            {team.ai_theme} · {team.district}
          </p>
        </div>
        {reg && (
          <Badge className={STATUS_STYLES[reg.status]} variant="secondary">
            {STATUS_LABELS[reg.status] ?? reg.status}
          </Badge>
        )}
      </div>

      {reg && (
        <section className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Status</span>
          <Select value={reg.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      {reg?.deck_path && (
        <section className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Uploaded deck</span>
          <InlineDeckViewer deckPath={reg.deck_path} />
        </section>
      )}

      {reg && (
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium">Assigned judges</span>
          <InlineJudgeAssign
            registrationId={reg.id}
            assignments={reg.assignments}
            judges={judges}
            onChange={(assignments) =>
              setTeam((prev) => (prev.registration ? { ...prev, registration: { ...prev.registration, assignments } } : prev))
            }
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium">Members ({team.members.length})</span>
        <div className="flex flex-col divide-y rounded-md border bg-card">
          {team.members.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.full_name}</span>
                {m.is_leader && (
                  <Badge variant="secondary" className="text-[10px]">
                    Leader
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground">{m.email}</span>
              <span className="text-muted-foreground">{m.phone}</span>
              <span className="text-muted-foreground">
                {m.college}
                {m.branch ? ` · ${m.branch}` : ""}
                {m.year ? ` · ${m.year}` : ""}
                {m.role_in_team ? ` · ${m.role_in_team}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      {reg && (
        <section className="flex flex-col gap-4">
          <IdeaField label="Problem statement" value={reg.problem_statement} />
          <IdeaField label="Proposed solution" value={reg.proposed_solution} />
          <IdeaField label="AI approach / technology" value={reg.ai_approach} />
          <IdeaField label="Expected impact" value={reg.expected_impact} />
          {reg.supporting_link && <IdeaField label="Supporting link" value={reg.supporting_link} />}
        </section>
      )}

      {!leader && <p className="text-sm text-muted-foreground">No leader on record for this team.</p>}
    </div>
  );
}

function IdeaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <p className="whitespace-pre-wrap break-words rounded-md border bg-card p-3 text-sm text-muted-foreground">
        {value}
      </p>
    </div>
  );
}
