"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { getVerificationTeamPage, type VerificationCounts, type VerificationTeamSummary } from "@/app/actions/verification";
import { useDebounced, usePagedList, useVisiblePolling } from "@/components/admin/use-paged-list";
import { Badge, Panel, SecondaryButton, SegmentedToggle, Select, TextInput } from "@/components/admin/ui";
import { VERIFICATION_STATUS_BADGE_VARIANT, VERIFICATION_STATUS_LABELS } from "@/lib/registration-status";
import { KERALA_DISTRICTS } from "@/lib/validations/team";
import { cn } from "@/lib/utils";

const VIEW_MODE_KEY = "gignite-volunteer-view-mode";
const GRID_COLS = "grid grid-cols-[1.5fr_1.4fr_0.9fr_0.7fr_1fr_1.1fr] items-center gap-3";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/**
 * Volunteer view of every registered team for eligibility verification —
 * team, college and member names only (see app/actions/verification.ts);
 * nothing about the idea or deck. Opening a team shows its members and ID
 * cards and the verify / ineligible controls. Loads 30 teams at a time and
 * more as you scroll; search and filters run on the server.
 */
export function VolunteerTeamsBrowser({
  initialTeams,
  initialTotal,
  initialCounts,
  pageSize,
}: {
  initialTeams: VerificationTeamSummary[];
  initialTotal: number;
  initialCounts: VerificationCounts;
  pageSize: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [counts, setCounts] = useState(initialCounts);
  const [verificationFilter, setVerificationFilter] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");

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

  const query = useMemo(
    () => ({ search: debouncedSearch, verification: verificationFilter, district: districtFilter }),
    [debouncedSearch, verificationFilter, districtFilter],
  );
  const {
    items: teams,
    setItems: setTeams,
    total,
    loading,
    failed,
    hasMore,
    loadMore,
    sentinelRef,
  } = usePagedList<VerificationTeamSummary>({
    initialItems: initialTeams,
    initialTotal,
    queryKey: JSON.stringify(query),
    pageSize,
    load: async (offset, limit) => {
      const result = await getVerificationTeamPage({ ...query, offset, limit });
      if (!result.success) return null;
      setCounts(result.counts);
      return { items: result.teams, total: result.total };
    },
  });

  // Live refresh: re-read the rows already on screen (up to 100 — small
  // rows, one request) and the counts, so verification by others shows up
  // without reloading the page or losing the scroll position.
  useVisiblePolling(() => {
    if (teams.length === 0 || teams.length > 100) return;
    void getVerificationTeamPage({ ...query, offset: 0, limit: teams.length }).then((result) => {
      if (!result.success) return;
      setCounts(result.counts);
      const fresh = new Map(result.teams.map((t) => [t.teamId, t]));
      setTeams((prev) => prev.map((t) => fresh.get(t.teamId) ?? t));
    });
  }, 30_000);

  const anyFilterActive = Boolean(verificationFilter || districtFilter);
  const goToTeam = (teamId: string) => router.push(`/dashboard/teams/${teamId}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["pending", "verified", "ineligible"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setVerificationFilter((f) => (f === status ? null : status))}
            className={cn("rounded-full transition-opacity", verificationFilter && verificationFilter !== status && "opacity-50")}
          >
            <Badge variant={VERIFICATION_STATUS_BADGE_VARIANT[status] ?? "neutral"}>
              {counts[status]} {VERIFICATION_STATUS_LABELS[status].toLowerCase()}
            </Badge>
          </button>
        ))}
      </div>

      <TextInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search team, entry code, college or member name"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-nowrap items-center gap-2.5 overflow-x-auto">
          <Select
            value={verificationFilter ?? ""}
            onChange={(e) => setVerificationFilter(e.target.value || null)}
            className={cn("w-auto flex-none py-[9px] text-[13.5px] font-semibold", verificationFilter ? "border-ignite-ink text-ignite-ink" : "text-ignite-ink-soft")}
          >
            <option value="">All verification</option>
            {Object.entries(VERIFICATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={districtFilter ?? ""}
            onChange={(e) => setDistrictFilter(e.target.value || null)}
            className={cn("w-auto flex-none py-[9px] text-[13.5px] font-semibold", districtFilter ? "border-ignite-ink text-ignite-ink" : "text-ignite-ink-soft")}
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
              <SecondaryButton
                type="button"
                onClick={() => {
                  setVerificationFilter(null);
                  setDistrictFilter(null);
                }}
              >
                Clear filters
              </SecondaryButton>
            </div>
          )}
        </div>
        <SegmentedToggle
          value={viewMode}
          onChange={changeViewMode}
          options={[
            { value: "list", label: "List", icon: <List className="h-4 w-4" /> },
            { value: "card", label: "Card", icon: <LayoutGrid className="h-4 w-4" /> },
          ]}
        />
      </div>

      <span className="-mt-2 font-ui text-[12px] text-ignite-muted">
        {teams.length} of {total} {anyFilterActive || debouncedSearch.trim() ? "matching " : ""}teams shown
      </span>

      {teams.length === 0 ? (
        <Panel className="py-10 text-center text-[14px] text-ignite-muted">
          {loading
            ? "Loading…"
            : counts.pending + counts.verified + counts.ineligible === 0
              ? "No teams registered yet."
              : "No teams match your search or filters."}
        </Panel>
      ) : viewMode === "list" ? (
        <Panel className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={cn(GRID_COLS, "border-b border-ignite-edge/[0.12] px-5 py-3")}>
              {["Team", "College", "District", "Members", "Verification", "Submitted"].map((h) => (
                <span key={h} className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">
                  {h}
                </span>
              ))}
            </div>
            {teams.map((team) => (
              <div
                key={team.teamId}
                className={cn(GRID_COLS, "cursor-pointer border-b border-ignite-edge/[0.07] px-5 py-4 last:border-b-0 hover:bg-ignite-bg/30")}
                onClick={() => goToTeam(team.teamId)}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-display font-semibold text-ignite-ink">{team.name}</span>
                  <span className="text-[12px] font-semibold tracking-[0.04em] text-ignite-muted">{team.entryCode}</span>
                </div>
                <span className="truncate text-[13px] text-ignite-ink-soft">{team.college ?? "—"}</span>
                <span className="text-[13px] text-ignite-ink-soft">{team.district}</span>
                <span className="text-[13px] text-ignite-ink-soft">{team.memberCount}</span>
                <span>
                  <Badge variant={VERIFICATION_STATUS_BADGE_VARIANT[team.verificationStatus] ?? "neutral"}>
                    {VERIFICATION_STATUS_LABELS[team.verificationStatus]}
                  </Badge>
                </span>
                <span className="text-[13px] text-ignite-muted">{formatDate(team.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Panel
              key={team.teamId}
              className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-ignite-ink"
              onClick={() => goToTeam(team.teamId)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display font-semibold text-ignite-ink">{team.name}</h3>
                  <p className="text-[12px] font-semibold tracking-[0.04em] text-ignite-muted">{team.entryCode}</p>
                </div>
                <Badge variant={VERIFICATION_STATUS_BADGE_VARIANT[team.verificationStatus] ?? "neutral"}>
                  {VERIFICATION_STATUS_LABELS[team.verificationStatus]}
                </Badge>
              </div>
              <div className="flex flex-col gap-1 text-[13px] text-ignite-muted">
                <span className="truncate">{team.college ?? "—"}</span>
                <span>
                  {team.district} · {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                </span>
                <span>Submitted {formatDate(team.createdAt)}</span>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {teams.length > 0 && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {failed ? (
            <SecondaryButton type="button" onClick={loadMore}>
              Couldn&apos;t load more — try again
            </SecondaryButton>
          ) : loading ? (
            <span className="font-ui text-[13px] text-ignite-muted">Loading more…</span>
          ) : hasMore ? (
            <SecondaryButton type="button" onClick={loadMore}>
              Load more
            </SecondaryButton>
          ) : (
            <span className="font-ui text-[12px] text-ignite-muted">All {total} shown</span>
          )}
        </div>
      )}
    </div>
  );
}
