"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteAmbassadors,
  setAmbassadorDetails,
  setAmbassadorRange,
  type AmbassadorRanking,
  type AmbassadorRankingRow,
} from "@/app/actions/ambassadors";
import { formatAmbassadorId } from "@/lib/ambassador";
import { Panel, PrimaryButton, SectionLabel, TextInput } from "@/components/admin/ui";
import { useLiveRefresh } from "./use-live-refresh";
import { AmbassadorSheetImport } from "./ambassador-sheet-import";
import { ConfirmDialog } from "./confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * Super-admin: set how many ambassador IDs exist (AMGIG-00 … AMGIG-NN),
 * enter each one's name and college (shown in the registration form's
 * dropdown), and see the ranking by registrations referred, refreshed live.
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
        {ranking.lastNumber !== null && (
          <span className="text-[13px] leading-[1.5] text-ignite-muted">
            The name and college you enter below appear next to each ID in the registration form&apos;s dropdown, so
            participants can find their ambassador.
          </span>
        )}
      </Panel>

      <AmbassadorSheetImport rows={ranking.rows} />

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
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-ignite-edge/[0.12] text-left font-ui text-[12px] font-bold uppercase tracking-[0.12em] text-ignite-muted">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3 text-right">Registrations</th>
                  <th className="px-4 py-3 text-right">Shortlisted</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Delete</span>
                  </th>
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
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(row.name ?? "");
  const [college, setCollege] = useState(row.college ?? "");
  const [saving, setSaving] = useState(false);
  // A live refresh brings the latest details unless this row is being edited.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (focused) return;
    setName(row.name ?? "");
    setCollege(row.college ?? "");
  }, [row.name, row.college, focused]);

  async function saveDetails() {
    setFocused(false);
    if (name.trim() === (row.name ?? "") && college.trim() === (row.college ?? "")) return;
    setSaving(true);
    const result = await setAmbassadorDetails(row.number, { name, college }).catch(() => ({
      success: false as const,
      error: "No connection — the details weren't saved.",
    }));
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      setName(row.name ?? "");
      setCollege(row.college ?? "");
      return;
    }
    toast.success(`Saved the details for ${formatAmbassadorId(row.number)}.`);
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await deleteAmbassadors(row.number).catch(() => ({
      success: false as const,
      error: "No connection — nothing was deleted.",
    }));
    setDeleting(false);
    setConfirmingDelete(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted ${formatAmbassadorId(row.number)}.`);
    router.refresh();
  }

  const label = [row.name, row.college].filter(Boolean).join(" · ");
  const inputProps = {
    disabled: saving || row.deleted,
    onFocus: () => setFocused(true),
    onBlur: saveDetails,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur(),
    className: "py-1.5 text-[14px]",
  };

  return (
    <tr className={cn("border-b border-ignite-edge/[0.06]", row.deleted && "opacity-60")}>
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
          {...inputProps}
          value={name}
          maxLength={80}
          placeholder="Add a name"
          onChange={(e) => setName(e.target.value)}
          aria-label={`Name for ${formatAmbassadorId(row.number)}`}
        />
      </td>
      <td className="px-4 py-1.5">
        <TextInput
          {...inputProps}
          value={college}
          maxLength={120}
          placeholder="Add a college"
          onChange={(e) => setCollege(e.target.value)}
          aria-label={`College for ${formatAmbassadorId(row.number)}`}
        />
      </td>
      <td className="px-4 py-2.5 text-right font-display text-[16px] font-bold text-ignite-ink">{row.total}</td>
      <td className="px-4 py-2.5 text-right text-ignite-ink-soft">{row.shortlisted}</td>
      <td className="px-4 py-2.5 text-right">
        {row.deleted ? (
          <span className="rounded-full bg-ignite-danger-pale px-2.5 py-1 font-ui text-[12px] font-bold text-ignite-danger">
            Deleted
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full border border-ignite-danger/60 px-3 py-1 font-ui text-[13px] font-semibold text-ignite-danger transition-colors hover:bg-ignite-danger hover:text-white"
            aria-label={`Delete ${formatAmbassadorId(row.number)}`}
          >
            Delete
          </button>
        )}
        {confirmingDelete && (
          <ConfirmDialog
            title={`Delete ${formatAmbassadorId(row.number)}?`}
            confirmLabel="Yes, delete"
            busy={deleting}
            onConfirm={confirmDelete}
            onCancel={() => setConfirmingDelete(false)}
          >
            <p className="m-0 text-left">
              <b>{formatAmbassadorId(row.number)}</b>
              {label ? ` (${label})` : ""} will be removed from the registration form&apos;s ambassador list, and
              participants won&apos;t be able to pick it any more. Other IDs keep their numbers.
            </p>
            {row.total > 0 && (
              <p className="m-0 text-left">
                {row.total} team{row.total === 1 ? " has" : "s have"} already picked this ambassador — those referrals
                are kept.
              </p>
            )}
          </ConfirmDialog>
        )}
      </td>
    </tr>
  );
}
