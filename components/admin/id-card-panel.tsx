"use client";

import { useEffect, useState } from "react";
import { getTeamMemberIdCardPaths, getMemberIdCardDownloadUrl } from "@/app/actions/admin";
import type { AdminMember } from "@/app/actions/admin";
import { SectionLabel, Spinner } from "@/components/admin/ui";

type RowState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

/**
 * Admin-only ID-card viewer: one row per member, click-to-reveal rather
 * than eager-fetch-on-mount like DeckPanel — a team can have up to 5
 * photos, so minting 5 signed URLs before anyone's asked for them is
 * wasted work. Paths themselves are fetched once on mount (just the path
 * strings, not signed URLs), gated the same admin-only way server-side.
 */
export function IdCardPanel({ teamId, members }: { teamId: string; members: AdminMember[] }) {
  const [paths, setPaths] = useState<Record<string, string | null> | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getTeamMemberIdCardPaths(teamId);
      if (cancelled) return;
      setPaths(result.success ? result.paths : {});
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function reveal(memberId: string) {
    const path = paths?.[memberId];
    if (!path) return;
    setRows((prev) => ({ ...prev, [memberId]: { status: "loading" } }));
    const result = await getMemberIdCardDownloadUrl(path);
    if (!result.success) {
      setRows((prev) => ({ ...prev, [memberId]: { status: "error", message: result.error } }));
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
    setRows((prev) => ({ ...prev, [memberId]: { status: "idle" } }));
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(44,44,44,0.05),0_12px_28px_rgba(32,65,154,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>ID cards</SectionLabel>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-accent">Admin only</span>
      </div>
      <div className="flex flex-col divide-y divide-gignite-divider">
        {members.map((m) => {
          const hasCard = Boolean(paths?.[m.id]);
          const row = rows[m.id] ?? { status: "idle" };
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
              <div>
                <div className="font-semibold text-black">{m.full_name}</div>
                <div className="text-gignite-text/70">{m.is_leader ? "Leader" : "Member"}</div>
              </div>
              {paths === null ? (
                <span className="flex items-center gap-2 font-mono text-[12px] text-gignite-text/50">
                  <Spinner className="h-3 w-3" />
                  Loading…
                </span>
              ) : !hasCard ? (
                <span className="font-mono text-[12px] text-gignite-text/50">Not uploaded</span>
              ) : row.status === "error" ? (
                <span className="text-[13px] text-gignite-danger">{row.message}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal(m.id)}
                  disabled={row.status === "loading"}
                  className="flex items-center gap-2 border-b-[1.5px] border-gignite-blue/35 pb-0.5 text-[14px] font-semibold text-gignite-blue transition-colors hover:border-gignite-accent hover:text-gignite-accent disabled:opacity-50"
                >
                  {row.status === "loading" && <Spinner className="h-3 w-3" />}
                  {row.status === "loading" ? "Opening…" : "View ID card ↗"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
