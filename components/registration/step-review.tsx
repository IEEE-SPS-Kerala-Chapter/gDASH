import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { getDeckPreviewUrl, getIdCardPreviewUrl } from "@/app/actions/registration";
import { displayFileName } from "@/lib/upload-file-name";
import { OTHER_COLLEGE } from "@/lib/kerala-colleges";
import { OTHER_ROLE } from "@/lib/validations/roles";
import { cn } from "@/lib/utils";
import { FormCard, Divider, Spinner } from "./ui";

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta"
    >
      Edit
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[14px]">
      <span className="text-ignite-muted">{label}</span>
      <span className="truncate text-right font-medium text-ignite-ink">{value || "—"}</span>
    </div>
  );
}

/**
 * The uploaded file is the participant's own college/government ID, not the
 * gIGNITE ID card the system generates after submission (that one only
 * exists once a real team_members row does — see components/registration/
 * id-card.tsx). Fetches a short-lived signed URL for `path` from Supabase
 * Storage via getIdCardPreviewUrl — works whether the file was picked this
 * session or the path came back from a resumed draft, unlike an
 * in-browser-memory preview, which only the former ever has.
 */
function IdCardThumb({ label, path }: { label: string; path: string }) {
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "ready"; url: string } | { status: "error" }>(
    { status: "idle" },
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!path) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    getIdCardPreviewUrl(path).then((result) => {
      if (cancelled) return;
      setState(result.success ? { status: "ready", url: result.url } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const ready = state.status === "ready";

  return (
    <>
      <div
        role={ready ? "button" : undefined}
        tabIndex={ready ? 0 : undefined}
        onClick={ready ? () => setExpanded(true) : undefined}
        onKeyDown={
          ready
            ? (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setExpanded(true);
                }
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-3 rounded-[10px] border-[1.5px] border-ignite-edge/[0.12] bg-ignite-bg p-3",
          ready && "cursor-pointer transition-colors hover:border-ignite-ink",
        )}
      >
        {state.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable remote asset
          <img src={state.url} alt={`${label} ID card`} className="h-14 w-14 flex-none rounded-[8px] object-cover" />
        ) : (
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[8px] bg-ignite-lavender font-ui text-[10px] text-ignite-ink">
            {state.status === "loading" ? <Spinner /> : "ID"}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-ignite-ink">{label}</span>
          <span className="text-[12px] text-ignite-muted">
            {state.status === "ready"
              ? "Uploaded — tap to view full size"
              : state.status === "error"
                ? "Uploaded — preview unavailable right now"
                : path
                  ? "Loading preview…"
                  : "Not uploaded"}
          </span>
        </div>
      </div>

      {expanded && ready && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close"
          onClick={() => setExpanded(false)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") setExpanded(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable remote asset */}
          <img
            src={(state as { status: "ready"; url: string }).url}
            alt={`${label} ID card, full size`}
            className="max-h-full max-w-full rounded-[10px] object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-ignite-surface text-[16px] font-semibold text-ignite-ink"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The idea's supporting material, opened back up the same way IdCardThumb
 * does an ID card — a fresh short-lived signed URL (getDeckPreviewUrl), so
 * it works after resuming a draft too. A PDF opens in an in-page viewer
 * (with "Open in new tab", since many phone browsers won't render a PDF
 * inside a page); a PPTX can't be shown by a browser, so it downloads.
 */
function DeckThumb({ path }: { path: string }) {
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "ready"; url: string } | { status: "error" }>(
    { status: "idle" },
  );
  const [viewing, setViewing] = useState(false);
  const isPdf = path.toLowerCase().endsWith(".pdf");
  const fileName = path ? displayFileName(path) : "";

  useEffect(() => {
    if (!path) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    getDeckPreviewUrl(path)
      .then((result) => {
        if (!cancelled) setState(result.success ? { status: "ready", url: result.url } : { status: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setViewing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewing]);

  const url = state.status === "ready" ? state.url : null;

  function open() {
    if (!url) return;
    if (isPdf) setViewing(true);
    else window.location.assign(url); // signed as a download — stays on this page
  }

  return (
    <>
      <div
        role={url ? "button" : undefined}
        tabIndex={url ? 0 : undefined}
        onClick={url ? open : undefined}
        onKeyDown={
          url
            ? (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  open();
                }
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-3 rounded-[10px] border-[1.5px] border-ignite-edge/[0.12] bg-ignite-bg p-3",
          url && "cursor-pointer transition-colors hover:border-ignite-ink",
        )}
      >
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[8px] bg-ignite-lavender font-ui text-[11px] font-bold text-ignite-ink">
          {state.status === "loading" ? <Spinner /> : isPdf ? "PDF" : path ? "PPTX" : "—"}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-ignite-ink">{fileName || "Supporting material"}</span>
          <span className="text-[12px] text-ignite-muted">
            {!path
              ? "Not uploaded"
              : state.status === "ready"
                ? isPdf
                  ? "Uploaded — tap to view"
                  : "Uploaded — tap to download and view"
                : state.status === "error"
                  ? "Uploaded — preview unavailable right now"
                  : "Loading…"}
          </span>
        </div>
      </div>

      {viewing && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${fileName}, supporting material`}
          onClick={() => setViewing(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 lg:p-8"
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            className="flex h-full w-full max-w-[1000px] flex-col overflow-hidden rounded-[14px] bg-ignite-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-ignite-edge/[0.08] px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ignite-ink">{fileName}</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta"
              >
                Open in new tab ↗
              </a>
              <button
                type="button"
                onClick={() => setViewing(false)}
                aria-label="Close"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ignite-bg text-[16px] font-semibold text-ignite-ink"
              >
                ×
              </button>
            </div>
            <iframe src={url} title={`${fileName}, supporting material`} className="h-full w-full flex-1 border-0 bg-white" />
          </div>
        </div>
      )}
    </>
  );
}

export function StepReview({
  form,
  onEdit,
}: {
  form: UseFormReturn<RegistrationForm>;
  onEdit: (stepKey: string) => void;
}) {
  const { team, members, idea } = form.getValues();
  const displayCollege = team.college === OTHER_COLLEGE ? team.collegeOther : team.college;

  return (
    <div className="flex flex-col gap-5">
      <FormCard>
        <div className="flex items-center justify-between">
          <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink">Team</span>
          <EditLink onClick={() => onEdit("team")} />
        </div>
        <ReviewRow label="Team name" value={team.teamName} />
        <ReviewRow label="AI theme" value={team.aiTheme} />
        <ReviewRow label="College" value={displayCollege ?? ""} />
        <ReviewRow label="District" value={team.district} />
        <Divider />
        <ReviewRow label="Leader" value={team.leaderName} />
        <ReviewRow label="Email" value={team.leaderEmail} />
        <ReviewRow label="Phone" value={team.leaderPhone} />
        <ReviewRow label="Branch / Year" value={[team.branch, team.year].filter(Boolean).join(" · ")} />
        <IdCardThumb label={`${team.leaderName || "Leader"}'s ID card`} path={team.idCardPath} />
      </FormCard>

      <FormCard>
        <div className="flex items-center justify-between">
          <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink">
            Other members ({members.length}) · team of {members.length + 1}
          </span>
          <EditLink onClick={() => onEdit("members")} />
        </div>
        {members.map((m, i) => {
          const role = m.roleInTeam === OTHER_ROLE ? m.roleInTeamOther : m.roleInTeam;
          return (
            <div key={i} className="flex flex-col gap-2.5 border-t border-ignite-edge/[0.07] pt-4 first:border-t-0 first:pt-0">
              <span className="text-[13px] font-semibold text-ignite-ink">{m.fullName || `Member ${i + 2}`}</span>
              <ReviewRow label="Email" value={m.email} />
              <ReviewRow label="Phone" value={m.phone} />
              <ReviewRow label="Role" value={role ?? ""} />
              <ReviewRow label="Branch / Year" value={[m.branch, m.year].filter(Boolean).join(" · ")} />
              <IdCardThumb label={`${m.fullName || `Member ${i + 2}`}'s ID card`} path={m.idCardPath} />
            </div>
          );
        })}
      </FormCard>

      <FormCard>
        <div className="flex items-center justify-between">
          <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink">Idea</span>
          <EditLink onClick={() => onEdit("idea")} />
        </div>
        <IdeaAnswer label="Problem statement" value={idea.problemStatement} />
        <IdeaAnswer label="Proposed solution" value={idea.proposedSolution} />
        <IdeaAnswer label="AI approach" value={idea.aiApproach} />
        <IdeaAnswer label="Expected impact" value={idea.expectedImpact} />
        {idea.supportingLink && <ReviewRow label="Supporting link" value={idea.supportingLink} />}
        <DeckThumb path={idea.deckPath} />
      </FormCard>
    </div>
  );
}

function IdeaAnswer({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">{label}</span>
      <p className="m-0 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ignite-ink-soft">{value}</p>
    </div>
  );
}
