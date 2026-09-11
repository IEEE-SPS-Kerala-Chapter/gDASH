"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { submitRegistration } from "@/app/actions/registration";
import { WizardHeader, ProgressBar, StepMeta, StepTitle, PrimaryButton } from "./ui";
import { StepTeam } from "./step-team";
import { StepMembers } from "./step-members";
import { StepIdea } from "./step-idea";
import { StepDeclarations } from "./step-declarations";

const STEPS = [
  {
    key: "team",
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
    label: "Step 2 of 4 · Members",
    title: "Your team",
    subtitle: "Between one and five members, all from Kerala professional colleges.",
    cta: "Continue to your idea",
    fields: ["members"] satisfies Path<RegistrationForm>[],
  },
  {
    key: "idea",
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
    label: "Step 4 of 4 · Declarations",
    title: "Before you submit",
    subtitle: "The leader confirms these on behalf of the whole team.",
    cta: "Submit registration",
    fields: ["declarations.eligibility", "declarations.originality", "declarations.rules"] satisfies Path<RegistrationForm>[],
  },
] as const;

const emptyDefaults = {
  team: {
    teamName: "",
    aiTheme: "",
    leaderName: "",
    leaderEmail: "",
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

export function RegistrationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<RegistrationForm>({
    // The generic Resolver<T> type that @hookform/resolvers infers from a
    // schema this deep (nested enums/literals) doesn't structurally match
    // react-hook-form's own Resolver<T> — a known type-only friction between
    // the two packages, not a real mismatch. Runtime behavior is correct.
    resolver: zodResolver(registrationFormSchema) as never,
    defaultValues: emptyDefaults,
    mode: "onBlur",
  });

  const current = STEPS[step];
  const decl = form.watch("declarations");
  const readyToSubmit = Boolean(decl?.eligibility && decl?.originality && decl?.rules);
  const isLastStep = step === STEPS.length - 1;

  async function handleContinue() {
    const valid = await form.trigger(current.fields as Path<RegistrationForm>[]);
    if (!valid) return;

    if (!isLastStep) {
      setStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    const result = await submitRegistration(form.getValues());
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
    <div className="mx-auto flex w-full max-w-[460px] flex-col overflow-hidden rounded-[30px] border border-black/[0.14] bg-gignite-card shadow-[0_18px_46px_rgba(44,44,44,0.13)]">
      <WizardHeader onBack={handleBack} canGoBack />
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void handleContinue();
        }}
        className="flex flex-col gap-[18px] px-5 pb-[34px] pt-5"
      >
        <div className="flex flex-col gap-[9px]">
          <ProgressBar step={step} />
          <StepMeta label={current.label} hint={hint} />
        </div>

        <StepTitle title={current.title} subtitle={current.subtitle} />

        {current.key === "team" && <StepTeam form={form} />}
        {current.key === "members" && <StepMembers form={form} />}
        {current.key === "idea" && <StepIdea form={form} />}
        {current.key === "declarations" && <StepDeclarations form={form} />}

        <PrimaryButton type="submit" disabled={submitting || (isLastStep && !readyToSubmit)}>
          {submitting ? "Submitting…" : current.cta}
        </PrimaryButton>
      </form>
    </div>
  );
}
