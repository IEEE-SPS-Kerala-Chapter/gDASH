"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminTeam, AdminJudge } from "@/app/actions/admin";
import {
  updateRegistrationStatus,
  exportRegistrationsCsv,
  getDeckDownloadUrl,
  assignJudge,
  unassignJudge,
} from "@/app/actions/admin";

const STATUS_STYLES: Record<string, string> = {
  submitted: "",
  under_review: "border-transparent bg-amber-100 text-amber-800",
  shortlisted: "border-transparent bg-emerald-100 text-emerald-800",
  rejected: "border-transparent bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
};

// Explicit locale + timezone, pinned so this renders identically on the
// server and the client (an unpinned toLocaleString() reflects whatever
// locale each environment happens to default to — Node's on the server,
// the browser's on the client — which are usually different and trigger a
// hydration mismatch) and so every viewer sees the same IST wall-clock time
// regardless of where the server or their own browser is.
function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DashboardTable({ teams: initialTeams, judges }: { teams: AdminTeam[]; judges: AdminJudge[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [selected, setSelected] = useState<AdminTeam | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deckLoading, setDeckLoading] = useState(false);
  const [pickedJudgeId, setPickedJudgeId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? teams.filter((t) => t.name.toLowerCase().includes(q) || t.ai_theme.toLowerCase().includes(q))
      : teams;
    return [...rows].sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortNewestFirst ? -diff : diff;
    });
  }, [teams, search, sortNewestFirst]);

  function patchRegistration(teamId: string, patch: Partial<NonNullable<AdminTeam["registration"]>>) {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId && t.registration ? { ...t, registration: { ...t.registration, ...patch } } : t)),
    );
    setSelected((prev) =>
      prev && prev.id === teamId && prev.registration ? { ...prev, registration: { ...prev.registration, ...patch } } : prev,
    );
  }

  async function handleStatusChange(registrationId: string, teamId: string, status: string) {
    const result = await updateRegistrationStatus(registrationId, status);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    patchRegistration(teamId, { status: status as NonNullable<AdminTeam["registration"]>["status"] });
    toast.success("Status updated.");
  }

  async function handleViewDeck(deckPath: string) {
    setDeckLoading(true);
    const result = await getDeckDownloadUrl(deckPath);
    setDeckLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function handleAssign(teamId: string, registrationId: string) {
    if (!pickedJudgeId) return;
    setAssigning(true);
    const result = await assignJudge(registrationId, pickedJudgeId);
    setAssigning(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const judge = judges.find((j) => j.id === pickedJudgeId);
    if (judge) {
      const newAssignment = { id: result.assignmentId, judge_id: judge.id, judge_name: judge.full_name };
      patchRegistration(teamId, {
        assignments: [...(teams.find((t) => t.id === teamId)?.registration?.assignments ?? []), newAssignment],
      });
    }
    setPickedJudgeId("");
    toast.success("Judge assigned.");
  }

  async function handleUnassign(teamId: string, assignmentId: string) {
    const result = await unassignJudge(assignmentId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const current = teams.find((t) => t.id === teamId)?.registration?.assignments ?? [];
    patchRegistration(teamId, { assignments: current.filter((a) => a.id !== assignmentId) });
    toast.success("Assignment removed.");
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportRegistrationsCsv();
    setExporting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const assignedIds = new Set(selected?.registration?.assignments.map((a) => a.judge_id) ?? []);
  const availableJudges = judges.filter((j) => !assignedIds.has(j.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search by team name or theme…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={handleExport} disabled={exporting} variant="outline">
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Theme</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Judges</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => setSortNewestFirst((s) => !s)}
              >
                Submitted {sortNewestFirst ? "↓" : "↑"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {teams.length === 0 ? "No teams registered yet." : "No teams match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((team) => {
                const leader = team.members.find((m) => m.is_leader);
                const status = team.registration?.status ?? "submitted";
                return (
                  <TableRow
                    key={team.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(team)}
                  >
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell>{team.ai_theme}</TableCell>
                    <TableCell>{team.members.length}</TableCell>
                    <TableCell>{leader?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[status]} variant="secondary">
                        {STATUS_LABELS[status] ?? status}
                      </Badge>
                    </TableCell>
                    <TableCell>{team.registration?.assignments.length ?? 0}</TableCell>
                    <TableCell>
                      {team.registration ? formatSubmittedAt(team.registration.created_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.ai_theme} · {selected.district}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-6 py-4">
                {selected.registration && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Status</span>
                    <Select
                      value={selected.registration.status}
                      onValueChange={(value) =>
                        selected.registration &&
                        handleStatusChange(selected.registration.id, selected.id, value)
                      }
                    >
                      <SelectTrigger className="w-full">
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
                  </div>
                )}

                {selected.registration?.deck_path && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Uploaded deck</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      disabled={deckLoading}
                      onClick={() => selected.registration?.deck_path && handleViewDeck(selected.registration.deck_path)}
                    >
                      {deckLoading ? "Opening…" : "View / download deck"}
                    </Button>
                  </div>
                )}

                {selected.registration && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Assigned judges</span>
                    {selected.registration.assignments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selected.registration.assignments.map((a) => (
                          <Badge key={a.id} variant="secondary" className="gap-1.5">
                            {a.judge_name}
                            <button
                              type="button"
                              aria-label={`Unassign ${a.judge_name}`}
                              onClick={() => handleUnassign(selected.id, a.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No judges assigned yet.</span>
                    )}

                    {availableJudges.length > 0 ? (
                      <div className="flex gap-2">
                        <Select value={pickedJudgeId} onValueChange={setPickedJudgeId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a judge…" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableJudges.map((j) => (
                              <SelectItem key={j.id} value={j.id}>
                                {j.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!pickedJudgeId || assigning}
                          onClick={() => selected.registration && handleAssign(selected.id, selected.registration.id)}
                        >
                          Assign
                        </Button>
                      </div>
                    ) : (
                      judges.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          No judge accounts exist yet — create one with the seed script (role: judge).
                        </span>
                      )
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    Members ({selected.members.length})
                  </span>
                  <div className="flex flex-col divide-y rounded-md border">
                    {selected.members.map((m) => (
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
                </div>

                {selected.registration && (
                  <div className="flex flex-col gap-4">
                    <IdeaField label="Problem statement" value={selected.registration.problem_statement} />
                    <IdeaField label="Proposed solution" value={selected.registration.proposed_solution} />
                    <IdeaField label="AI approach / technology" value={selected.registration.ai_approach} />
                    <IdeaField label="Expected impact" value={selected.registration.expected_impact} />
                    {selected.registration.supporting_link && (
                      <IdeaField label="Supporting link" value={selected.registration.supporting_link} />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function IdeaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{value}</p>
    </div>
  );
}
