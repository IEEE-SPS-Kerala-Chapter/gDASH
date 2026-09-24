import { Controller, type UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { RULES_URL } from "@/lib/config";
import { OTHER_COLLEGE } from "@/lib/kerala-colleges";
import { FormCard } from "./ui";
import { cn } from "@/lib/utils";

const DECLARATIONS = [
  {
    key: "eligibility" as const,
    title: "Student eligibility",
    body: "Every member is a current student at a professional college in Kerala, and none of us is an organizer, volunteer, judge or sponsor.",
    tag: "Required",
  },
  {
    key: "originality" as const,
    title: "Originality & code ownership",
    body: "Work shown at the finale will be built during the event. No pre-written code beyond open-source libraries, and prior work will be declared in the README.",
    tag: "Required",
  },
  {
    key: "rules" as const,
    title: "Hackathon rules & code of conduct",
    body: "We've read the rules and the code of conduct, and accept that the jury's decision is final.",
    tag: "Required",
  },
  {
    key: "mediaConsent" as const,
    title: "Photography & media consent",
    body: "Photos, video and project details from the event may be used for gIGNITE promotion.",
    tag: "Optional",
  },
];

export function StepDeclarations({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const { control, watch } = form;
  const decl = watch("declarations");
  const teamName = watch("team.teamName");
  const aiTheme = watch("team.aiTheme");
  const college = watch("team.college");
  const collegeOther = watch("team.collegeOther");
  const displayCollege = college === OTHER_COLLEGE ? collegeOther : college;
  const memberCount = 1 + (watch("members")?.length ?? 0);

  return (
    <div className="flex flex-col gap-[16px]">
      <FormCard>
        {DECLARATIONS.map((d) => (
          <Controller
            key={d.key}
            control={control}
            name={`declarations.${d.key}`}
            render={({ field }) => {
              const checked = Boolean(field.value);
              return (
                <div
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={0}
                  onClick={() => field.onChange(!checked)}
                  onKeyDown={(ev) => {
                    // Ignore keydowns bubbling up from the nested "Rules to
                    // follow" link — only the row itself toggles the box.
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      field.onChange(!checked);
                    }
                  }}
                  className="flex cursor-pointer gap-[13px] border-t border-black/[0.07] py-3 first:border-t-0 first:pt-0"
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-bold text-white transition-colors",
                      checked ? "border-ignite-ink bg-ignite-ink" : "border-black/[0.12] bg-white",
                    )}
                  >
                    {checked ? "✓" : ""}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[15px] font-semibold leading-[1.4] text-ignite-ink">{d.title}</span>
                      <span
                        className={cn(
                          "font-ui text-[10px] font-bold uppercase tracking-[0.1em]",
                          d.tag === "Required" ? "text-ignite-danger" : "text-ignite-muted",
                        )}
                      >
                        {d.tag}
                      </span>
                    </div>
                    <span className="text-[13px] leading-[1.5] text-ignite-muted">{d.body}</span>
                    {d.key === "rules" && (
                      <a
                        href={RULES_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="mt-1 w-fit rounded-full border border-ignite-ink/70 bg-white/60 px-4 py-[6px] font-ui text-[13px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-ink hover:text-white"
                      >
                        Rules to follow ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            }}
          />
        ))}
      </FormCard>

      <div className="flex flex-col gap-[11px] rounded-2xl bg-ignite-lavender p-[18px]">
        <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink">
          Entry summary
        </span>
        <div className="flex flex-col gap-[6px]">
          <SummaryRow label="Team" value={`${teamName || "—"} · ${memberCount} member${memberCount === 1 ? "" : "s"}`} />
          <SummaryRow label="Theme" value={aiTheme || "—"} />
          <SummaryRow label="College" value={displayCollege || "—"} />
        </div>
      </div>

      <p className="m-0 text-center text-[12px] leading-[1.5] text-ignite-muted">
        {decl?.eligibility && decl?.originality && decl?.rules
          ? "Submitted registrations can't be edited, so check the Review step before you submit."
          : "Confirm the three required declarations to submit."}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[14px] text-ignite-ink-soft">{label}</span>
      <span className="text-[14px] font-semibold text-ignite-ink">{value}</span>
    </div>
  );
}
