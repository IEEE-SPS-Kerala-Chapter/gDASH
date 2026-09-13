"use client";

import type { AdminTeam } from "@/app/actions/admin";
import { Panel } from "@/components/admin/ui";
import { REGISTRATION_STATUS_LABELS } from "@/lib/registration-status";
import { AI_THEMES } from "@/lib/validations/team";

/** Per "gIGNITE Team List Analytics.dc.html" (Claude Design). Daily
 * submissions trend + two composition donuts (by theme, by status) above
 * the team list — clicking a legend row sets that as the active filter,
 * same as clicking a donut slice would in the design. */

export const THEME_COLORS: Record<string, string> = {
  "AI for Healthcare": "#20419A",
  "AI for Mobility & Transportation": "#F27721",
  "AI for Disaster Management": "#1F7A42",
  "AI for Smart Cities": "#C25E0E",
  "Open Innovation Track": "#6B6355",
};

export const STATUS_COLORS: Record<string, string> = {
  submitted: "#20419A",
  under_review: "#F27721",
  shortlisted: "#16794F",
  rejected: "#9A9184",
};

function conicGradient(counts: [string, number][], colors: Record<string, string>): string {
  const total = counts.reduce((sum, [, n]) => sum + n, 0) || 1;
  let acc = 0;
  const stops = counts.map(([key, n]) => {
    const start = (acc / total) * 360;
    acc += n;
    const end = (acc / total) * 360;
    return `${colors[key] ?? "#D9CDB2"} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function DonutPanel({
  title,
  counts,
  colors,
  labelFor,
  total,
  activeKey,
  onToggle,
}: {
  title: string;
  counts: [string, number][];
  colors: Record<string, string>;
  labelFor: (key: string) => string;
  total: number;
  activeKey: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <Panel className="flex flex-col gap-3.5 p-5">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">{title}</span>
      <div className="flex items-center gap-5">
        <div
          className="relative h-[100px] w-[100px] flex-none rounded-full"
          style={{ background: conicGradient(counts, colors) }}
        >
          <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="font-heading text-[18px] font-bold text-black">{total}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-gignite-text/60">teams</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {counts.map(([key, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className="flex items-center gap-2 border-none bg-transparent p-0 text-left"
              style={{ opacity: !activeKey || activeKey === key ? 1 : 0.35 }}
            >
              <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: colors[key] }} />
              <span className="truncate text-[12.5px] text-gignite-text">{labelFor(key)}</span>
              <span className="font-mono text-[11px] text-gignite-text/55">{n}</span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function kolkataDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function computeDailyCounts(teams: AdminTeam[]) {
  const now = new Date();
  const days: { key: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push({
      key: d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
    });
  }
  const counts = new Map<string, number>();
  teams.forEach((t) => {
    const created = t.registration?.created_at;
    if (!created) return;
    const key = kolkataDayKey(created);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const todayKey = days[days.length - 1].key;
  return days.map((d) => ({ ...d, count: counts.get(d.key) ?? 0, isToday: d.key === todayKey }));
}

function DailyActivityPanel({ teams }: { teams: AdminTeam[] }) {
  const daily = computeDailyCounts(teams);
  const today = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2];
  const delta = today.count - yesterday.count;
  const maxCount = Math.max(1, ...daily.map((d) => d.count));

  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/65">Daily submissions</span>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-[24px] font-bold text-black">{today.count}</span>
          <span className="text-[13px] text-gignite-text/70">today</span>
          <span className={`font-mono text-[12px] ${delta >= 0 ? "text-gignite-success" : "text-gignite-danger"}`}>
            {delta >= 0 ? "+" : ""}
            {delta} vs yesterday
          </span>
        </div>
      </div>
      <div className="flex h-24 items-end gap-2.5">
        {daily.map((d) => (
          <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="font-mono text-[11px] text-gignite-text/60">{d.count}</span>
            <div
              className="w-full rounded-t-[6px] rounded-b-[3px]"
              style={{
                height: `${Math.max(6, Math.round((d.count / maxCount) * 64))}px`,
                background: d.isToday ? "#F27721" : "#C7D3ED",
              }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-gignite-text/55">
              {d.label.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RegistrationsAnalytics({
  teams,
  statusFilter,
  themeFilter,
  onStatusFilter,
  onThemeFilter,
}: {
  teams: AdminTeam[];
  statusFilter: string | null;
  themeFilter: string | null;
  onStatusFilter: (status: string | null) => void;
  onThemeFilter: (theme: string | null) => void;
}) {
  const themeCounts: [string, number][] = AI_THEMES.map((theme) => [
    theme,
    teams.filter((t) => t.ai_theme === theme).length,
  ]);
  const statusCounts: [string, number][] = Object.keys(REGISTRATION_STATUS_LABELS).map((status) => [
    status,
    teams.filter((t) => (t.registration?.status ?? "submitted") === status).length,
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr_1fr]">
      <DailyActivityPanel teams={teams} />
      <DonutPanel
        title="By theme"
        counts={themeCounts}
        colors={THEME_COLORS}
        labelFor={(k) => k.replace("AI for ", "")}
        total={teams.length}
        activeKey={themeFilter}
        onToggle={(k) => onThemeFilter(themeFilter === k ? null : k)}
      />
      <DonutPanel
        title="By status"
        counts={statusCounts}
        colors={STATUS_COLORS}
        labelFor={(k) => REGISTRATION_STATUS_LABELS[k] ?? k}
        total={teams.length}
        activeKey={statusFilter}
        onToggle={(k) => onStatusFilter(statusFilter === k ? null : k)}
      />
    </div>
  );
}
