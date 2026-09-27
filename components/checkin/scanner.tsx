"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type QrScannerType from "qr-scanner";
import { scanMember, undoScan, type OpenCheckpoint, type ScanOutcome, type ScannedMember } from "@/app/actions/checkin";
import { getVerificationIdCardUrl } from "@/app/actions/verification";
import { Panel, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const MODE_KEY = "gignite-scan-checkpoint";
const SAME_CODE_COOLDOWN_MS = 3000;
const RESUME_AFTER_OK_MS = 1500;
const UNDO_WINDOW_MS = 2 * 60 * 1000;

type View =
  | { phase: "ready" }
  | { phase: "working" }
  | { phase: "result"; outcome: ScanOutcome; checkpoint: OpenCheckpoint }
  | { phase: "error"; message: string; raw: string };

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

/**
 * Event-day scanner for volunteers and admins. Pick a check-in point (venue
 * or an open meal slot), then scan ID-card QR codes — or type a member
 * code. Every scan is saved on the server immediately (scan_member), which
 * is what prevents double claims across volunteers; there's no offline mode.
 */
export function Scanner({ checkpoints }: { checkpoints: OpenCheckpoint[] }) {
  const router = useRouter();
  const [checkpointId, setCheckpointId] = useState<string>(checkpoints[0]?.id ?? "");
  const [view, setView] = useState<View>({ phase: "ready" });
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const checkpointRef = useRef<OpenCheckpoint | undefined>(undefined);

  const checkpoint = checkpoints.find((c) => c.id === checkpointId);
  checkpointRef.current = checkpoint;

  // Remember the chosen check-in point on this device; fall back to the
  // first open one if the saved one has been closed.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved && checkpoints.some((c) => c.id === saved)) setCheckpointId(saved);
    } catch {
      // ignore
    }
  }, [checkpoints]);

  function chooseCheckpoint(id: string) {
    setCheckpointId(id);
    setView({ phase: "ready" });
    try {
      localStorage.setItem(MODE_KEY, id);
    } catch {
      // ignore
    }
  }

  const submit = useCallback(async (raw: string) => {
    const current = checkpointRef.current;
    if (!current || busyRef.current) return;
    busyRef.current = true;
    setView({ phase: "working" });
    let response: Awaited<ReturnType<typeof scanMember>>;
    try {
      response = await scanMember(current.id, raw);
    } catch {
      response = { success: false, error: "No connection — the scan wasn't saved." };
    }
    if (!response.success) {
      setView({ phase: "error", message: response.error, raw });
      navigator.vibrate?.([80, 60, 80, 60, 80]);
      return;
    }
    setView({ phase: "result", outcome: response.outcome, checkpoint: current });
    navigator.vibrate?.(response.outcome.result === "ok" ? 80 : [80, 60, 80]);
  }, []);

  function next() {
    busyRef.current = false;
    setView({ phase: "ready" });
  }

  // Camera. qr-scanner is loaded only in the browser, when this screen opens.
  useEffect(() => {
    if (!checkpoint) return;
    let cancelled = false;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          const code = result.data;
          const last = lastCodeRef.current;
          if (last && last.code === code && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) return;
          lastCodeRef.current = { code, at: Date.now() };
          void submit(code);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 5 },
      );
      scannerRef.current = scanner;
      try {
        await scanner.start();
        setCameraError(null);
      } catch {
        setCameraError("Couldn't open the camera. Allow camera access for this site, or type the member code below.");
      }
    })();
    return () => {
      cancelled = true;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
    // Recreate only when a check-in point becomes available/unavailable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(checkpoint), submit]);

  // After a successful scan the camera starts listening again shortly (the
  // green card stays, with Undo, until the next scan replaces it). Anything
  // else waits for "Next scan" so the volunteer notices it.
  useEffect(() => {
    if (view.phase !== "result" || view.outcome.result !== "ok") return;
    const timer = setTimeout(() => {
      busyRef.current = false;
    }, RESUME_AFTER_OK_MS);
    return () => clearTimeout(timer);
  }, [view]);

  if (checkpoints.length === 0) {
    return (
      <Panel className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="m-0 font-display text-[18px] font-semibold text-ignite-ink">No check-in point is open</p>
        <p className="m-0 max-w-sm text-[14px] text-ignite-muted">
          Ask an admin to open Venue check-in or a meal on the Check-in setup page, then refresh.
        </p>
        <div className="w-fit">
          <SecondaryButton type="button" onClick={() => router.refresh()}>
            Refresh
          </SecondaryButton>
        </div>
      </Panel>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <Select value={checkpointId} onChange={(e) => chooseCheckpoint(e.target.value)} className="text-[15px] font-semibold">
        {checkpoints.map((c) => (
          <option key={c.id} value={c.id}>
            {c.kind === "venue" ? "📍 " : "🍽️ "}
            {c.label}
          </option>
        ))}
      </Select>

      <div className="relative overflow-hidden rounded-[18px] bg-black">
        {/* The video keeps running under the result card so the next scan is instant. */}
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        {view.phase !== "ready" && !(view.phase === "result" && view.outcome.result === "ok") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            {view.phase === "working" && <Spinner className="h-8 w-8 text-white" />}
          </div>
        )}
      </div>
      {cameraError && <p className="m-0 text-[13px] text-ignite-danger">{cameraError}</p>}

      {view.phase === "result" && (
        <ResultCard outcome={view.outcome} checkpoint={view.checkpoint} onNext={next} />
      )}
      {view.phase === "error" && (
        <Panel className="flex flex-col gap-3 border-ignite-danger/40 bg-ignite-danger-pale p-5">
          <p className="m-0 font-display text-[18px] font-bold text-ignite-danger">Scan not saved</p>
          <p className="m-0 text-[14px] text-ignite-ink-soft">{view.message}</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <PrimaryButton
                type="button"
                onClick={() => {
                  busyRef.current = false;
                  void submit(view.raw);
                }}
              >
                Retry
              </PrimaryButton>
            </div>
            <div className="flex-1">
              <SecondaryButton type="button" onClick={next}>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        </Panel>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!manualCode.trim()) return;
          busyRef.current = false;
          void submit(manualCode);
          setManualCode("");
        }}
      >
        <TextInput
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or type a member code, e.g. GIG-7K3QPA-1"
          autoCapitalize="characters"
        />
        <div className="w-auto flex-none">
          <SecondaryButton type="submit" disabled={!manualCode.trim()}>
            Check
          </SecondaryButton>
        </div>
      </form>
    </div>
  );
}

function ResultCard({ outcome, checkpoint, onNext }: { outcome: ScanOutcome; checkpoint: OpenCheckpoint; onNext: () => void }) {
  const isMeal = checkpoint.kind === "meal";
  const tone =
    outcome.result === "ok" ? "success" : outcome.result === "already" ? "warn" : "danger";

  const heading =
    outcome.result === "ok"
      ? isMeal
        ? `${checkpoint.label} — claimed`
        : "Checked in"
      : outcome.result === "already"
        ? isMeal
          ? `Already claimed at ${timeLabel(outcome.scannedAt)}`
          : `Already checked in at ${timeLabel(outcome.scannedAt)}`
        : outcome.result === "not_eligible"
          ? "Not eligible — team not shortlisted"
          : outcome.result === "checkpoint_closed"
            ? `${checkpoint.label} is closed`
            : outcome.result === "invalid_code"
              ? "Not a gIGNITE ID card"
              : "Member not found";

  const member = "member" in outcome ? outcome.member : null;

  return (
    <Panel
      className={cn(
        "flex flex-col gap-4 p-5",
        tone === "success" && "border-ignite-success/40 bg-ignite-success-pale",
        tone === "warn" && "border-ignite-warn/40 bg-ignite-warn-pale",
        tone === "danger" && "border-ignite-danger/40 bg-ignite-danger-pale",
      )}
    >
      <p
        className={cn(
          "m-0 font-display text-[20px] font-bold",
          tone === "success" && "text-ignite-success",
          tone === "warn" && "text-ignite-warn",
          tone === "danger" && "text-ignite-danger",
        )}
      >
        {tone === "success" ? "✅ " : tone === "warn" ? "⚠️ " : "⛔ "}
        {heading}
      </p>
      {outcome.result === "already" && outcome.scannedByName && (
        <p className="m-0 text-[13px] text-ignite-ink-soft">Scanned by {outcome.scannedByName}</p>
      )}

      {member && <MemberSummary member={member} />}
      {member && isMeal && outcome.result === "ok" && !member.venueCheckedIn && (
        <p className="m-0 text-[13px] font-semibold text-ignite-warn">Heads-up: this person hasn&apos;t checked in at the venue.</p>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <PrimaryButton type="button" onClick={onNext}>
            Next scan
          </PrimaryButton>
        </div>
        {outcome.result === "ok" && member && <UndoButton checkpointId={checkpoint.id} member={member} scannedAt={outcome.scannedAt} onDone={onNext} />}
      </div>
    </Panel>
  );
}

function MemberSummary({ member }: { member: ScannedMember }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<"loading" | "ready" | "none">(member.hasIdCard ? "loading" : "none");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!member.hasIdCard) return;
    let cancelled = false;
    getVerificationIdCardUrl(member.id).then((r) => {
      if (cancelled) return;
      if (r.success) {
        setPhoto(r.url);
        setPhotoState("ready");
      } else {
        setPhotoState("none");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [member.id, member.hasIdCard]);

  return (
    <div className="flex gap-4">
      <button
        type="button"
        disabled={photoState !== "ready"}
        onClick={() => setExpanded(true)}
        className="flex h-[110px] w-[110px] flex-none items-center justify-center overflow-hidden rounded-[12px] border border-ignite-edge/[0.12] bg-ignite-surface text-center text-[11px] text-ignite-muted"
      >
        {photoState === "loading" && <Spinner />}
        {photoState === "none" && "No ID card photo"}
        {photoState === "ready" && photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img src={photo} alt={`${member.fullName}'s ID card`} className="h-full w-full object-cover" />
        )}
      </button>
      <div className="flex min-w-0 flex-col gap-1 text-[14px]">
        <span className="font-display text-[18px] font-semibold text-ignite-ink">
          {member.fullName}
          {member.isLeader && <span className="ml-2 text-[12px] font-bold text-ignite-magenta">Leader</span>}
        </span>
        <span className="text-[13px] font-bold tracking-[0.04em] text-ignite-muted">{member.memberCode}</span>
        <span className="text-ignite-ink-soft">
          {member.teamName} · {member.entryCode}
        </span>
        <span className="text-[13px] text-ignite-muted">{member.college}</span>
      </div>
      {expanded && photo && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
          <img src={photo} alt={`${member.fullName}'s ID card, full size`} className="max-h-full max-w-full rounded-[10px] object-contain" />
        </div>
      )}
    </div>
  );
}

function UndoButton({
  checkpointId,
  member,
  scannedAt,
  onDone,
}: {
  checkpointId: string;
  member: ScannedMember;
  scannedAt: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withinWindow = Date.now() - new Date(scannedAt).getTime() < UNDO_WINDOW_MS;
  if (!withinWindow) return null;

  return (
    <div className="flex flex-1 flex-col gap-1">
      <SecondaryButton
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await undoScan(checkpointId, member.id).catch(() => ({ success: false as const, error: "No connection — try again." }));
          setBusy(false);
          if (r.success) onDone();
          else setError(r.error);
        }}
      >
        {busy ? "Undoing…" : "Undo"}
      </SecondaryButton>
      {error && <span className="text-[12px] text-ignite-danger">{error}</span>}
    </div>
  );
}
