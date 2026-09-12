"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, List } from "lucide-react";
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
import { Card } from "@/components/ui/card";
import type { AdminTeam, AdminJudge, AdminAssignment, AdminRegistration } from "@/app/actions/admin";
import { exportRegistrationsCsv } from "@/app/actions/admin";
import { InlineJudgeAssign } from "./inline-judge-assign";
import { InlineStatusSelect } from "./inline-status-select";
import { cn } from "@/lib/utils";

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

const VIEW_MODE_KEY = "gignite-admin-view-mode";

export function TeamsBrowser({ teams: initialTeams, judges }: { teams: AdminTeam[]; judges: AdminJudge[] }) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");

  // Remembered per-browser, not critical data — fine to keep in localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === "list" || saved === "card") setViewMode(saved);
    } catch {
      // ignore — private browsing etc.
    }
  }, []);

  function changeViewMode(mode: "list" | "card") {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }

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

  function handleAssignmentsChange(teamId: string, assignments: AdminAssignment[]) {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId && t.registration ? { ...t, registration: { ...t.registration, assignments } } : t)),
    );
  }

  function handleStatusChange(teamId: string, status: string) {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId && t.registration
          ? { ...t, registration: { ...t.registration, status: status as AdminRegistration["status"] } }
          : t,
      ),
    );
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

  function goToTeam(teamId: string) {
    router.push(`/dashboard/teams/${teamId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search by team name or theme…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-card p-0.5">
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              aria-label="List view"
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm",
                viewMode === "list" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
              )}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("card")}
              aria-label="Card view"
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm",
                viewMode === "card" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Card
            </button>
          </div>
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border bg-card py-10 text-center text-muted-foreground">
          {teams.length === 0 ? "No teams registered yet." : "No teams match your search."}
        </div>
      ) : viewMode === "list" ? (
        <div className="rounded-md border bg-card">
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
              {filtered.map((team) => {
                const leader = team.members.find((m) => m.is_leader);
                const status = team.registration?.status ?? "submitted";
                return (
                  <TableRow key={team.id} className="cursor-pointer" onClick={() => goToTeam(team.id)}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell>{team.ai_theme}</TableCell>
                    <TableCell>{team.members.length}</TableCell>
                    <TableCell>{leader?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {team.registration ? (
                        <InlineStatusSelect
                          registrationId={team.registration.id}
                          status={status}
                          onChange={(s) => handleStatusChange(team.id, s)}
                        />
                      ) : (
                        <Badge className={STATUS_STYLES[status]} variant="secondary">
                          {STATUS_LABELS[status] ?? status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {team.registration ? (
                        <InlineJudgeAssign
                          registrationId={team.registration.id}
                          assignments={team.registration.assignments}
                          judges={judges}
                          onChange={(a) => handleAssignmentsChange(team.id, a)}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {team.registration ? new Date(team.registration.created_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => {
            const leader = team.members.find((m) => m.is_leader);
            const status = team.registration?.status ?? "submitted";
            return (
              <Card
                key={team.id}
                className="flex cursor-pointer flex-col gap-3 p-4 hover:border-primary"
                onClick={() => goToTeam(team.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading font-semibold">{team.name}</h3>
                    <p className="text-sm text-muted-foreground">{team.ai_theme}</p>
                  </div>
                  {team.registration ? (
                    <InlineStatusSelect
                      registrationId={team.registration.id}
                      status={status}
                      onChange={(s) => handleStatusChange(team.id, s)}
                    />
                  ) : (
                    <Badge className={STATUS_STYLES[status]} variant="secondary">
                      {STATUS_LABELS[status] ?? status}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span>Leader: {leader?.full_name ?? "—"}</span>
                  <span>{team.members.length} member(s)</span>
                  <span>
                    {team.registration
                      ? new Date(team.registration.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Not submitted"}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Judges
                  </span>
                  {team.registration ? (
                    <InlineJudgeAssign
                      registrationId={team.registration.id}
                      assignments={team.registration.assignments}
                      judges={judges}
                      onChange={(a) => handleAssignmentsChange(team.id, a)}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
