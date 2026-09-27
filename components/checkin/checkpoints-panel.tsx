"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createMealCheckpoint,
  deleteCheckpoint,
  renameCheckpoint,
  setCheckpointOpen,
  type Checkpoint,
} from "@/app/actions/checkin";
import { Badge, FormCard, PrimaryButton, SecondaryButton, Switch, TextInput } from "@/components/admin/ui";

/**
 * Admin-only: venue check-in plus the meal slots volunteers can scan for.
 * Only open ones appear in the scanner. A meal that already has scans can
 * be closed but not deleted.
 */
export function CheckpointsPanel({ checkpoints: initial }: { checkpoints: Checkpoint[] }) {
  const router = useRouter();
  const [checkpoints, setCheckpoints] = useState(initial);
  useEffect(() => setCheckpoints(initial), [initial]);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function run(action: () => Promise<{ success: true } | { success: false; error: string }>, done: string) {
    const result = await action();
    if (result.success) {
      toast.success(done);
      router.refresh();
    } else {
      toast.error(result.error);
    }
    return result.success;
  }

  return (
    <div className="flex flex-col gap-4">
      <FormCard>
        <h2 className="m-0 font-display text-[19px] font-bold text-ignite-ink">Check-in points</h2>
        <p className="m-0 text-[13px] text-ignite-muted">
          Volunteers see only the points that are open. Each participant can be scanned once per point.
        </p>
        <div className="flex flex-col">
          {checkpoints.map((c) => (
            <CheckpointRow key={c.id} checkpoint={c} run={run} />
          ))}
        </div>
      </FormCard>

      <FormCard>
        <h2 className="m-0 font-display text-[19px] font-bold text-ignite-ink">Add a meal</h2>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setAdding(true);
            const ok = await run(() => createMealCheckpoint(newLabel), "Meal added. Open it when serving starts.");
            setAdding(false);
            if (ok) setNewLabel("");
          }}
        >
          <TextInput
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Day 1 · Lunch"
            maxLength={60}
          />
          <div className="w-full sm:w-auto sm:flex-none">
            <PrimaryButton type="submit" disabled={adding || !newLabel.trim()} loading={adding}>
              {adding ? "Adding…" : "Add meal"}
            </PrimaryButton>
          </div>
        </form>
      </FormCard>
    </div>
  );
}

function CheckpointRow({
  checkpoint: c,
  run,
}: {
  checkpoint: Checkpoint;
  run: (action: () => Promise<{ success: true } | { success: false; error: string }>, done: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(c.label);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-ignite-edge/[0.07] py-4 first:border-t-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await run(() => renameCheckpoint(c.id, label), "Renamed.");
              setBusy(false);
              if (ok) setEditing(false);
            }}
          >
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus />
            <div className="flex-none">
              <SecondaryButton type="submit" disabled={busy || !label.trim()}>
                Save
              </SecondaryButton>
            </div>
          </form>
        ) : (
          <span className="font-display text-[16px] font-semibold text-ignite-ink">
            {c.kind === "venue" ? "📍 " : "🍽️ "}
            {c.label}
          </span>
        )}
        <span className="text-[13px] text-ignite-muted">
          {c.scanCount} scanned{c.kind === "meal" ? " · meal" : " · venue"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={c.isOpen}
          ariaLabel={`${c.label} open`}
          onChange={async (open) => {
            setBusy(true);
            await run(() => setCheckpointOpen(c.id, open), open ? `${c.label} is open for scanning.` : `${c.label} is closed.`);
            setBusy(false);
          }}
        />
        <Badge variant={c.isOpen ? "success" : "neutral"}>{c.isOpen ? "Open" : "Closed"}</Badge>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[13px] font-semibold text-ignite-ink-soft hover:text-ignite-ink"
          >
            Rename
          </button>
        )}
        {c.kind === "meal" && c.scanCount === 0 && !editing && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await run(() => deleteCheckpoint(c.id), "Meal deleted.");
              setBusy(false);
            }}
            className="text-[13px] font-semibold text-ignite-muted hover:text-ignite-danger disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
