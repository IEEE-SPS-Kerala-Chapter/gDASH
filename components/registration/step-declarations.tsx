import { Controller, type UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { RULES_URL } from "@/lib/config";
import { OTHER_COLLEGE } from "@/lib/kerala-colleges";
import { FormCard } from "./ui";
import { cn } from "@/lib/utils";

const DECLARATIONS = [
  {
    key: "eligibility" as const,
    title: "🎓 Student Check",
    body: "Everyone on the squad is a student at the same professional college in Kerala. None of us is an organiser, volunteer, judge, or sponsor.",
    tag: "Required",
  },
  {
    key: "originality" as const,
    title: "💡 Originality & Ownership",
    body: "The idea submitted by the squad is our own original concept or a legitimate adaptation/application of a publicly known problem or challenge. The proposed solution and approach demonstrate the squad's own originality and contribution.",
    tag: "Required",
  },
  {
    key: "rules" as const,
    title: "📜 Rules & Code of Conduct",
    body: "We've read and understood the hackathon rules and code of conduct and agree to follow them. We also accept that the jury's decision is final.",
    tag: "Required",
  },
  {
    key: "mediaConsent" as const,
    title: "📸 Media Consent",
    body: "Our crew is good with the photos, videos, and project highlights from the event being used for g-IGNITE'26 promotions.",
    tag: "Required",
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
                  className="flex cursor-pointer gap-[13px] border-t border-ignite-edge/[0.07] py-3 first:border-t-0 first:pt-0"
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-bold text-ignite-on-primary transition-colors",
                      checked ? "border-ignite-primary bg-ignite-primary" : "border-ignite-edge/[0.18] bg-ignite-surface",
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
                        className="mt-1 w-fit rounded-full border border-ignite-ink/70 bg-ignite-surface/60 px-4 py-[6px] font-ui text-[13px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-primary hover:text-ignite-on-primary"
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
          <SummaryRow label="Squad" value={`${teamName || "—"} · ${memberCount} member${memberCount === 1 ? "" : "s"}`} />
          <SummaryRow label="Track" value={aiTheme || "—"} />
          <SummaryRow label="College" value={displayCollege || "—"} />
        </div>
      </div>

      <p className="m-0 text-center text-[12px] leading-[1.5] text-ignite-muted">
        {decl?.eligibility && decl?.originality && decl?.rules && decl?.mediaConsent
          ? "Submitted registrations can't be edited, so check everything before you lock it in."
          : "Confirm all four declarations to submit."}
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
