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
import type { AdminTeam } from "@/app/actions/admin";
import { updateRegistrationStatus, exportRegistrationsCsv } from "@/app/actions/admin";

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

export function DashboardTable({ teams: initialTeams }: { teams: AdminTeam[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [selected, setSelected] = useState<AdminTeam | null>(null);
  const [exporting, setExporting] = useState(false);

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

  async function handleStatusChange(registrationId: string, teamId: string, status: string) {
    const result = await updateRegistrationStatus(registrationId, status);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId && t.registration
          ? { ...t, registration: { ...t.registration, status: status as typeof t.registration.status } }
          : t,
      ),
    );
    setSelected((prev) =>
      prev && prev.id === teamId && prev.registration
        ? { ...prev, registration: { ...prev.registration, status: status as typeof prev.registration.status } }
        : prev,
    );
    toast.success("Status updated.");
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
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                    <TableCell>
                      {team.registration ? new Date(team.registration.created_at).toLocaleString() : "—"}
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
