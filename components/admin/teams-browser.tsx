"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, List } from "lucide-react";
import type { AdminTeam, AdminJudge, AdminAssignment, AdminRegistration } from "@/app/actions/admin";
import { exportRegistrationsCsv } from "@/app/actions/admin";
import { InlineJudgeAssign } from "./inline-judge-assign";
import { InlineStatusSelect } from "./inline-status-select";
import { RegistrationsAnalytics } from "./registrations-analytics";
import { Badge, Panel, SecondaryButton, SegmentedToggle, Select, TextInput } from "@/components/admin/ui";
import { REGISTRATION_STATUS_BADGE_VARIANT, REGISTRATION_STATUS_LABELS } from "@/lib/registration-status";
import { downloadCsv } from "@/lib/csv-download";
import { AI_THEMES, KERALA_DISTRICTS } from "@/lib/validations/team";
import { cn } from "@/lib/utils";

const VIEW_MODE_KEY = "gignite-admin-view-mode";

const GRID_COLS = "grid grid-cols-[1.3fr_1.1fr_0.6fr_1fr_1fr_1.6fr_0.9fr_1.3fr] items-center gap-3";

function formatSubmitted(dateString: string) {
  return new Date(dateString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TeamsBrowser({ teams: initialTeams, judges }: { teams: AdminTeam[]; judges: AdminJudge[] }) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

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
    const rows = teams.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.ai_theme.toLowerCase().includes(q)) return false;
      if (statusFilter && (t.registration?.status ?? "submitted") !== statusFilter) return false;
      if (themeFilter && t.ai_theme !== themeFilter) return false;
      if (districtFilter && t.district !== districtFilter) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortNewestFirst ? -diff : diff;
    });
  }, [teams, search, sortNewestFirst, statusFilter, themeFilter, districtFilter]);

  const anyFilterActive = Boolean(statusFilter || themeFilter || districtFilter);
  function clearFilters() {
    setStatusFilter(null);
    setThemeFilter(null);
    setDistrictFilter(null);
  }

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
    downloadCsv(result.csv, result.filename);
  }

  function goToTeam(teamId: string) {
    router.push(`/dashboard/teams/${teamId}`);
  }

  function StatusCell({ team, status }: { team: AdminTeam; status: string }) {
    return team.registration ? (
      <InlineStatusSelect
        registrationId={team.registration.id}
        status={status}
        onChange={(s) => handleStatusChange(team.id, s)}
      />
    ) : (
      <Badge variant={REGISTRATION_STATUS_BADGE_VARIANT[status] ?? "neutral"}>
        {REGISTRATION_STATUS_LABELS[status] ?? status}
      </Badge>
    );
  }

  function JudgesCell({ team }: { team: AdminTeam }) {
    return team.registration ? (
      <InlineJudgeAssign
        registrationId={team.registration.id}
        assignments={team.registration.assignments}
        judges={judges}
        scoredJudgeIds={team.registration.scores.map((s) => s.judgeId)}
        onChange={(a) => handleAssignmentsChange(team.id, a)}
      />
    ) : (
      <span className="text-[13px] text-gignite-text/60">—</span>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="w-full max-w-xs">
        <TextInput
          placeholder="Search by team name or theme…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="py-[9px] text-[14px]"
        />
      </div>

      <RegistrationsAnalytics
        teams={teams}
        statusFilter={statusFilter}
        themeFilter={themeFilter}
        onStatusFilter={setStatusFilter}
        onThemeFilter={setThemeFilter}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-nowrap items-center gap-2.5 overflow-x-auto">
          <Select
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className={cn("w-auto flex-none py-[9px] text-[13.5px] font-semibold", statusFilter ? "border-gignite-blue text-gignite-blue" : "text-gignite-text")}
          >
            <option value="">All statuses</option>
            {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={themeFilter ?? ""}
            onChange={(e) => setThemeFilter(e.target.value || null)}
            className={cn("w-auto max-w-[190px] flex-none truncate py-[9px] text-[13.5px] font-semibold", themeFilter ? "border-gignite-blue text-gignite-blue" : "text-gignite-text")}
          >
            <option value="">All themes</option>
            {AI_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </Select>
          <Select
            value={districtFilter ?? ""}
            onChange={(e) => setDistrictFilter(e.target.value || null)}
            className="w-auto flex-none py-[9px] text-[13.5px] text-gignite-text"
          >
            <option value="">All districts</option>
            {KERALA_DISTRICTS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </Select>
          {anyFilterActive && (
            <div className="flex-none">
              <SecondaryButton type="button" onClick={clearFilters}>
                Clear filters
              </SecondaryButton>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SegmentedToggle
            value={viewMode}
            onChange={changeViewMode}
            options={[
              { value: "list", label: "List", icon: <List className="h-4 w-4" /> },
              { value: "card", label: "Card", icon: <LayoutGrid className="h-4 w-4" /> },
            ]}
          />
          <SecondaryButton type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </SecondaryButton>
        </div>
      </div>

      <span className="-mt-2 font-mono text-[12px] text-gignite-text/60">
        {filtered.length} of {teams.length} teams shown
      </span>

      {filtered.length === 0 ? (
        <Panel className="py-10 text-center text-[14px] text-gignite-text/60">
          {teams.length === 0 ? "No teams registered yet." : "No teams match your search or filters."}
        </Panel>
      ) : viewMode === "list" ? (
        <Panel className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={cn(GRID_COLS, "border-b border-gignite-border px-5 py-3")}>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Team</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Theme</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Members</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Leader</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Status</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Judges</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Avg score</span>
              <button
                type="button"
                onClick={() => setSortNewestFirst((s) => !s)}
                className="text-left font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70 hover:text-gignite-blue"
              >
                Submitted {sortNewestFirst ? "↓" : "↑"}
              </button>
            </div>
            {filtered.map((team) => {
              const leader = team.members.find((m) => m.is_leader);
              const status = team.registration?.status ?? "submitted";
              return (
                <div
                  key={team.id}
                  className={cn(GRID_COLS, "cursor-pointer border-b border-gignite-divider px-5 py-4 last:border-b-0 hover:bg-gignite-bg/30")}
                  onClick={() => goToTeam(team.id)}
                >
                  <span className="truncate font-heading font-semibold text-black">{team.name}</span>
                  <span className="truncate text-[14px] text-gignite-text/80">{team.ai_theme}</span>
                  <span className="text-[14px] text-gignite-text/80">{team.members.length}</span>
                  <span className="truncate text-[14px] text-gignite-text/80">{leader?.full_name ?? "—"}</span>
                  <StatusCell team={team} status={status} />
                  <JudgesCell team={team} />
                  <span className="text-[14px] text-gignite-text/80">
                    {team.registration?.avgScore != null ? `${team.registration.avgScore.toFixed(1)} / 10` : "—"}
                  </span>
                  <span className="text-[13px] text-gignite-text/60">
                    {team.registration ? formatSubmitted(team.registration.created_at) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => {
            const leader = team.members.find((m) => m.is_leader);
            const status = team.registration?.status ?? "submitted";
            return (
              <Panel
                key={team.id}
                className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-gignite-blue"
                onClick={() => goToTeam(team.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading font-semibold text-black">{team.name}</h3>
                    <p className="text-[13px] text-gignite-text/70">{team.ai_theme}</p>
                  </div>
                  <StatusCell team={team} status={status} />
                </div>
                <div className="flex flex-col gap-1 text-[13px] text-gignite-text/70">
                  <span>Leader: {leader?.full_name ?? "—"}</span>
                  <span>{team.members.length} member(s)</span>
                  <span>{team.registration ? formatSubmitted(team.registration.created_at) : "Not submitted"}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gignite-divider pt-3">
                  <div>
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-text/60">
                      Judges
                    </span>
                    <JudgesCell team={team} />
                  </div>
                  {team.registration?.avgScore != null && (
                    <span className="whitespace-nowrap text-[13px] font-semibold text-gignite-text">
                      {team.registration.avgScore.toFixed(1)} / 10
                    </span>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
