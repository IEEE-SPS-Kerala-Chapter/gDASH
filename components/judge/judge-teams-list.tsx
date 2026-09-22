"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { Badge, Panel, SegmentedToggle } from "@/components/admin/ui";
import type { AdminTeam } from "@/app/actions/admin";

const VIEW_MODE_KEY = "gignite-judge-view-mode";

const GRID_COLS = "grid grid-cols-[26px_minmax(0,1.4fr)_1fr_1fr] items-center gap-3";

/**
 * A judge's submission queue — per the Claude Design file "gIGNITE Judge
 * Scoring.dc.html". That design also covers Grand Finale scoring (8
 * parameters, dual stage weights), which this platform doesn't have data
 * for yet — only its Stage-1 queue/scoring look is adapted here, using our
 * actual 5-criteria scores. List view is our own addition (the design only
 * showed cards), matching the admin dashboard's list/card toggle pattern.
 */
export function JudgeTeamsList({ teams }: { teams: AdminTeam[] }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"list" | "card">("card");
  // A saved draft isn't "fully scored" — only count a genuine submission.
  const scoredCount = teams.filter((t) => t.registration?.scores[0]?.status === "submitted").length;
  const progressPct = teams.length > 0 ? Math.round((scoredCount / teams.length) * 100) : 0;

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

  if (teams.length === 0) {
    return (
      <Panel className="py-10 text-center text-[14px] text-gignite-text/60">
        No teams have been assigned to you yet.
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-heading text-[15px] font-bold text-black">
            {scoredCount} of {teams.length} fully scored
          </span>
          <SegmentedToggle
            value={viewMode}
            onChange={changeViewMode}
            options={[
              { value: "list", label: "List", icon: <List className="h-4 w-4" /> },
              { value: "card", label: "Card", icon: <LayoutGrid className="h-4 w-4" /> },
            ]}
          />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gignite-divider">
          <div className="h-full rounded-full bg-gignite-accent transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {viewMode === "list" ? (
        <Panel className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={`${GRID_COLS} border-b border-gignite-border px-5 py-3`}>
              <span />
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Team</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Theme</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">Your score</span>
            </div>
            {teams.map((team) => {
              const myScore = team.registration?.scores[0];
              const submitted = myScore?.status === "submitted";
              return (
                <div
                  key={team.id}
                  className={`${GRID_COLS} cursor-pointer border-b border-gignite-divider px-5 py-4 last:border-b-0 hover:bg-gignite-bg/30`}
                  onClick={() => router.push(`/dashboard/teams/${team.id}`)}
                >
                  {submitted ? (
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gignite-blue text-[11px] font-semibold text-white">
                      ✓
                    </div>
                  ) : myScore ? (
                    <div className="h-[22px] w-[22px] rounded-full border-[1.5px] border-dashed border-gignite-warn" />
                  ) : (
                    <div className="h-[22px] w-[22px] rounded-full border-[1.5px] border-gignite-border-strong" />
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate font-heading font-semibold text-black">{team.name}</span>
                    <span className="truncate text-[13px] text-gignite-text/60">{team.district}</span>
                  </div>
                  <Badge className="w-fit">{team.ai_theme}</Badge>
                  <span
                    className={`font-mono text-[13px] ${
                      submitted ? "text-gignite-blue" : myScore ? "text-gignite-warn" : "text-gignite-text/60"
                    }`}
                  >
                    {submitted && myScore?.weighted != null
                      ? `${myScore.weighted.toFixed(1)} / 10`
                      : myScore
                        ? "Draft saved"
                        : "Not scored"}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {teams.map((team) => {
            const myScore = team.registration?.scores[0];
            const submitted = myScore?.status === "submitted";
            const excerpt = team.registration?.problem_statement ?? "";
            return (
              <Panel
                key={team.id}
                className="flex cursor-pointer gap-4 p-5 transition-transform hover:-translate-y-0.5"
                onClick={() => router.push(`/dashboard/teams/${team.id}`)}
              >
                <div className="flex-none pt-0.5">
                  {submitted ? (
                    <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-gignite-blue text-[13px] font-semibold text-white">
                      ✓
                    </div>
                  ) : myScore ? (
                    <div className="h-[26px] w-[26px] rounded-full border-[1.5px] border-dashed border-gignite-warn" />
                  ) : (
                    <div className="h-[26px] w-[26px] rounded-full border-[1.5px] border-gignite-border-strong" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="m-0 font-heading text-[18px] font-medium leading-snug tracking-[-0.01em] text-black">
                      {team.name}
                    </h3>
                    <span className="flex-none font-mono text-[12px] text-gignite-text/60">{team.district}</span>
                  </div>
                  {excerpt && (
                    <p className="m-0 line-clamp-2 text-[14px] leading-[1.5] text-gignite-text/90">{excerpt}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                    <Badge>{team.ai_theme}</Badge>
                    <span
                      className={`font-mono text-[12px] ${
                        submitted ? "text-gignite-blue" : myScore ? "text-gignite-warn" : "text-gignite-text/60"
                      }`}
                    >
                      {submitted && myScore?.weighted != null
                        ? `Scored ${myScore.weighted.toFixed(1)}/10`
                        : myScore
                          ? "Draft saved"
                          : "Not scored"}
                    </span>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
