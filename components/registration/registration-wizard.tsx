"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { submitRegistration } from "@/app/actions/registration";
import {
  WizardHeader,
  ProgressBar,
  StepMeta,
  StepTitle,
  PrimaryButton,
  SecondaryButton,
  DesktopSidebar,
} from "./ui";
import { StepTeam } from "./step-team";
import { StepMembers } from "./step-members";
import { StepIdea } from "./step-idea";
import { StepDeclarations } from "./step-declarations";
import { TurnstileWidget } from "./turnstile-widget";

const STEPS = [
  {
    key: "team",
    nav: "Team",
    label: "Step 1 of 4 · Team",
    title: "Team details",
    subtitle: "You're registering as team leader. Members come next.",
    cta: "Continue to members",
    fields: [
      "team.teamName",
      "team.aiTheme",
      "team.leaderName",
      "team.leaderEmail",
      "team.leaderPhone",
      "team.college",
      "team.district",
    ] satisfies Path<RegistrationForm>[],
  },
  {
    key: "members",
    nav: "Members",
    label: "Step 2 of 4 · Members",
    title: "Your team",
    subtitle: "Between one and five members, all from Kerala professional colleges.",
    cta: "Continue to your idea",
    fields: ["members"] satisfies Path<RegistrationForm>[],
  },
  {
    key: "idea",
    nav: "Idea",
    label: "Step 3 of 4 · Idea",
    title: "Your idea",
    subtitle: "These four answers become your Stage 1 deck. No prototype needed.",
    cta: "Continue to declarations",
    fields: [
      "idea.problemStatement",
      "idea.proposedSolution",
      "idea.aiApproach",
      "idea.expectedImpact",
      "idea.supportingLink",
    ] satisfies Path<RegistrationForm>[],
  },
  {
    key: "declarations",
    nav: "Declarations",
    label: "Step 4 of 4 · Declarations",
    title: "Before you submit",
    subtitle: "The leader confirms these on behalf of the whole team.",
    cta: "Submit registration",
    fields: ["declarations.eligibility", "declarations.originality", "declarations.rules"] satisfies Path<RegistrationForm>[],
  },
] as const;

function buildDefaults(leaderEmail: string) {
  return {
    team: {
      teamName: "",
      aiTheme: "",
      leaderName: "",
      leaderEmail,
      leaderPhone: "",
      college: "",
      district: "",
    },
    members: [],
    idea: {
      problemStatement: "",
      proposedSolution: "",
      aiApproach: "",
      expectedImpact: "",
      supportingLink: "",
      deckPath: "",
    },
    declarations: {
      eligibility: false,
      originality: false,
      rules: false,
      mediaConsent: false,
    },
  } as unknown as RegistrationForm;
}

export function RegistrationWizard({ leaderEmail }: { leaderEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const form = useForm<RegistrationForm>({
    // The generic Resolver<T> type that @hookform/resolvers infers from a
    // schema this deep (nested enums/literals) doesn't structurally match
    // react-hook-form's own Resolver<T> — a known type-only friction between
    // the two packages, not a real mismatch. Runtime behavior is correct.
    resolver: zodResolver(registrationFormSchema) as never,
    defaultValues: buildDefaults(leaderEmail),
    mode: "onBlur",
  });

  const current = STEPS[step];
  const decl = form.watch("declarations");
  const readyToSubmit = Boolean(decl?.eligibility && decl?.originality && decl?.rules);
  const isLastStep = step === STEPS.length - 1;
  const turnstileConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function handleContinue() {
    const valid = await form.trigger(current.fields as Path<RegistrationForm>[]);
    if (!valid) return;

    if (!isLastStep) {
      setStep((s) => s + 1);
      return;
    }
    if (turnstileConfigured && !turnstileToken) {
      toast.error("Please complete the verification challenge.");
      return;
    }

    setSubmitting(true);
    const result = await submitRegistration(form.getValues(), {
      honeypot: honeypotRef.current?.value,
      turnstileToken,
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Registration submitted!");
    router.push(`/register/status/${result.accessToken}`);
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      router.push("/");
    }
  }

  const hint =
    current.key === "team"
      ? "Saves as you go"
      : current.key === "members"
        ? `${1 + form.watch("members").length} of 5 added`
        : current.key === "idea"
          ? "Draft — not saved until submit"
          : `${[decl?.eligibility, decl?.originality, decl?.rules, decl?.mediaConsent].filter(Boolean).length} of 4 confirmed`;

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-10 lg:max-w-[1320px] lg:flex-row lg:items-start lg:gap-20">
      <DesktopSidebar steps={STEPS} step={step} onHome={() => router.push("/")} />

      <div
        className={
          "flex w-full flex-col overflow-hidden rounded-[30px] border border-black/[0.14] " +
          "bg-gignite-card shadow-[0_18px_46px_rgba(44,44,44,0.13)] " +
          // Desktop drops the outer card entirely — the form sits directly on
          // the page background, so only the per-section field groups below
          // (FormCard) read as cards, not the whole panel doubled up.
          "lg:flex-1 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        }
      >
        <div className="lg:hidden">
          <WizardHeader onBack={handleBack} canGoBack />
        </div>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void handleContinue();
          }}
          className="flex flex-col gap-[18px] px-5 pb-[34px] pt-5 lg:px-0 lg:pb-0 lg:pt-0"
        >
          {/* Honeypot: real users never see or fill this. Any bot that fills
              every field in a scripted form submit trips it. */}
          <input
            ref={honeypotRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
          />

          <div className="flex flex-col gap-[9px] lg:hidden">
            <ProgressBar step={step} />
            <StepMeta label={current.label} hint={hint} />
          </div>

          <div className="hidden items-baseline justify-between lg:flex">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
              {current.label}
            </span>
            <span className="font-mono text-[11px] text-gignite-text/65">{hint}</span>
          </div>

          <StepTitle title={current.title} subtitle={current.subtitle} />

          <div className="lg:max-w-[760px]">
            {current.key === "team" && <StepTeam form={form} />}
            {current.key === "members" && <StepMembers form={form} />}
            {current.key === "idea" && <StepIdea form={form} />}
            {current.key === "declarations" && <StepDeclarations form={form} />}
          </div>

          {isLastStep && (
            <div className="lg:max-w-[760px]">
              <TurnstileWidget onToken={setTurnstileToken} />
            </div>
          )}

          <div className="flex flex-col gap-3 lg:max-w-[760px] lg:flex-row-reverse lg:items-center">
            <div className="lg:flex-1">
              <PrimaryButton type="submit" disabled={submitting || (isLastStep && !readyToSubmit)}>
                {submitting ? "Submitting…" : current.cta}
              </PrimaryButton>
            </div>
            {step > 0 && (
              <div className="hidden lg:block">
                <SecondaryButton type="button" onClick={handleBack}>
                  ← Back
                </SecondaryButton>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
