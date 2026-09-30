"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setAmbassadorName,
  setAmbassadorRange,
  type AmbassadorRanking,
  type AmbassadorRankingRow,
} from "@/app/actions/ambassadors";
import { formatAmbassadorId } from "@/lib/ambassador";
import { Panel, PrimaryButton, SectionLabel, TextInput } from "@/components/admin/ui";
import { useLiveRefresh } from "./use-live-refresh";
import { cn } from "@/lib/utils";

/**
 * Super-admin: set how many ambassador IDs exist (AMGIG-00 … AMGIG-NN) and
 * see the ranking by registrations referred, refreshed live.
 */
export function AmbassadorsManager({ ranking }: { ranking: AmbassadorRanking }) {
  useLiveRefresh({ intervalMs: 15_000 });
  const router = useRouter();
  const [lastInput, setLastInput] = useState(ranking.lastNumber === null ? "" : String(ranking.lastNumber));
  const [savingRange, setSavingRange] = useState(false);

  async function saveRange() {
    const n = Number(lastInput);
    if (lastInput.trim() === "" || !Number.isInteger(n) || n < 0 || n > 999) {
      toast.error("Enter the last ambassador number, from 0 to 999.");
      return;
    }
    setSavingRange(true);
    const result = await setAmbassadorRange(n).catch(() => ({ success: false as const, error: "No connection — nothing was saved." }));
    setSavingRange(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Ambassador IDs now run AMGIG-00 to ${formatAmbassadorId(n)}.`);
    router.refresh();
  }

  const count = ranking.lastNumber === null ? 0 : ranking.lastNumber + 1;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-3 p-5">
        <SectionLabel>Ambassador IDs</SectionLabel>
        <div className="flex flex-wrap items-center gap-2 font-ui text-[15px] text-ignite-ink">
          <span>IDs run from</span>
          <span className="font-bold tracking-[0.04em]">AMGIG-00</span>
          <span>to</span>
          <span className="font-bold tracking-[0.04em]">AMGIG-</span>
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={lastInput}
            onChange={(e) => setLastInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveRange()}
            placeholder="NN"
            className="w-24 py-2"
            aria-label="Last ambassador number"
          />
          <div className="w-28">
            <PrimaryButton type="button" onClick={saveRange} disabled={savingRange} loading={savingRange}>
              {savingRange ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </div>
        <span className="text-[13px] leading-[1.5] text-ignite-muted">
          {ranking.lastNumber === null
            ? "No ambassador IDs yet — the registration form doesn't show the ambassador question until you set this."
            : `${count} ambassador ID${count === 1 ? "" : "s"}. The registration form lists these plus “No ambassador referred”. You can raise the range any time; it can't be lowered below an ID a team has already picked.`}
        </span>
      </Panel>

      {ranking.lastNumber !== null && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>Ranking</SectionLabel>
            <span className="font-ui text-[13px] text-ignite-muted">
              {ranking.referred} registration{ranking.referred === 1 ? "" : "s"} referred · {ranking.noAmbassador} with no ambassador ·
              updates every 15 seconds
            </span>
          </div>
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-ignite-edge/[0.12] text-left font-ui text-[12px] font-bold uppercase tracking-[0.12em] text-ignite-muted">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name (staff only)</th>
                  <th className="px-4 py-3 text-right">Registrations</th>
                  <th className="px-4 py-3 text-right">Shortlisted</th>
                </tr>
              </thead>
              <tbody>
                {ranking.rows.map((row) => (
                  <RankingRow key={row.number} row={row} />
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}

function RankingRow({ row }: { row: AmbassadorRankingRow }) {
  const [name, setName] = useState(row.name ?? "");
  const [saving, setSaving] = useState(false);
  // A live refresh brings the latest name unless this one is being edited.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setName(row.name ?? "");
  }, [row.name, focused]);

  async function saveName() {
    setFocused(false);
    if (name.trim() === (row.name ?? "")) return;
    setSaving(true);
    const result = await setAmbassadorName(row.number, name).catch(() => ({ success: false as const, error: "No connection — the name wasn't saved." }));
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      setName(row.name ?? "");
      return;
    }
    toast.success(`Saved the name for ${formatAmbassadorId(row.number)}.`);
  }

  return (
    <tr className="border-b border-ignite-edge/[0.06]">
      <td className="px-4 py-2.5">
        {row.rank === null ? (
          <span className="text-ignite-faint">—</span>
        ) : (
          <span
            className={cn(
              "inline-flex min-w-[32px] justify-center rounded-full px-2 py-0.5 font-display text-[13px] font-bold",
              row.rank === 1 ? "bg-ignite-primary text-ignite-on-primary" : "bg-ignite-lavender text-ignite-ink",
            )}
          >
            #{row.rank}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 font-semibold tracking-[0.04em] text-ignite-ink">{formatAmbassadorId(row.number)}</td>
      <td className="px-4 py-1.5">
        <TextInput
          value={name}
          maxLength={80}
          disabled={saving}
          placeholder="Add a name"
          onFocus={() => setFocused(true)}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="py-1.5 text-[14px]"
          aria-label={`Name for ${formatAmbassadorId(row.number)}`}
        />
      </td>
      <td className="px-4 py-2.5 text-right font-display text-[16px] font-bold text-ignite-ink">{row.total}</td>
      <td className="px-4 py-2.5 text-right text-ignite-ink-soft">{row.shortlisted}</td>
    </tr>
  );
}
