import type { AttendanceSummaryItem } from "@/app/actions/attendance";
import { Badge, Panel } from "@/components/admin/ui";

/** Counts only — shown to volunteers and admins. No names. */
export function AttendanceSummary({ items }: { items: AttendanceSummaryItem[] }) {
  if (items.length === 0) {
    return <Panel className="py-8 text-center text-[14px] text-ignite-muted">No check-in points set up yet.</Panel>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => {
        const pct = c.eligible > 0 ? Math.round((c.scanned / c.eligible) * 100) : 0;
        return (
          <Panel key={c.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-display text-[15px] font-semibold text-ignite-ink">
                {c.kind === "venue" ? "📍 " : "🍽️ "}
                {c.label}
              </span>
              <Badge variant={c.isOpen ? "success" : "neutral"}>{c.isOpen ? "Open" : "Closed"}</Badge>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[28px] font-bold text-ignite-ink">{c.scanned}</span>
              <span className="text-[14px] text-ignite-muted">
                of {c.eligible} {c.kind === "venue" ? "checked in" : "served"}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-ignite-edge/[0.1]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${c.label}: ${pct}%`}
            >
              <div className="h-full rounded-full bg-ignite-success transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[12px] text-ignite-muted">{pct}% of shortlisted participants</span>
          </Panel>
        );
      })}
    </div>
  );
}
