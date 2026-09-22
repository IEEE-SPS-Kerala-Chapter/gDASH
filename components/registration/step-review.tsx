import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { getIdCardPreviewUrl } from "@/app/actions/registration";
import { OTHER_COLLEGE } from "@/lib/kerala-colleges";
import { OTHER_ROLE } from "@/lib/validations/roles";
import { FormCard, Divider, Spinner } from "./ui";

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent"
    >
      Edit
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[14px]">
      <span className="text-gignite-text/70">{label}</span>
      <span className="truncate text-right font-medium text-black">{value || "—"}</span>
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

  return (
    <div className="flex items-center gap-3 rounded-[10px] border-[1.5px] border-gignite-border bg-gignite-card p-3">
      {state.status === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable remote asset
        <img src={state.url} alt={`${label} ID card`} className="h-14 w-14 flex-none rounded-[8px] object-cover" />
      ) : (
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[8px] bg-gignite-blue-pale font-mono text-[10px] text-gignite-blue">
          {state.status === "loading" ? <Spinner /> : "ID"}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-black">{label}</span>
        <span className="text-[12px] text-gignite-text/70">
          {state.status === "ready"
            ? "Uploaded"
            : state.status === "error"
              ? "Uploaded — preview unavailable right now"
              : path
                ? "Loading preview…"
                : "Not uploaded"}
        </span>
      </div>
    </div>
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
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">Team</span>
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
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
            Members ({members.length})
          </span>
          <EditLink onClick={() => onEdit("members")} />
        </div>
        {members.map((m, i) => {
          const role = m.roleInTeam === OTHER_ROLE ? m.roleInTeamOther : m.roleInTeam;
          return (
            <div key={i} className="flex flex-col gap-2.5 border-t border-gignite-divider pt-4 first:border-t-0 first:pt-0">
              <span className="text-[13px] font-semibold text-black">{m.fullName || `Member ${i + 2}`}</span>
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
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">Idea</span>
          <EditLink onClick={() => onEdit("idea")} />
        </div>
        <IdeaAnswer label="Problem statement" value={idea.problemStatement} />
        <IdeaAnswer label="Proposed solution" value={idea.proposedSolution} />
        <IdeaAnswer label="AI approach" value={idea.aiApproach} />
        <IdeaAnswer label="Expected impact" value={idea.expectedImpact} />
        {idea.supportingLink && <ReviewRow label="Supporting link" value={idea.supportingLink} />}
        <ReviewRow label="Supporting material" value={idea.deckPath ? "Uploaded" : "Not uploaded"} />
      </FormCard>
    </div>
  );
}

function IdeaAnswer({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-gignite-text/60">{label}</span>
      <p className="m-0 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-gignite-text">{value}</p>
    </div>
  );
}
