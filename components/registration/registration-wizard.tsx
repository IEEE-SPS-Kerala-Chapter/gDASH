"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { submitRegistration, saveRegistrationDraft, loadRegistrationDraft } from "@/app/actions/registration";
import { saveDraft, loadDraft, clearDraft } from "@/lib/registration-draft";
import { createClient } from "@/lib/supabase/client";
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
import { StepReview } from "./step-review";
import { StepDeclarations } from "./step-declarations";
import { TurnstileWidget } from "./turnstile-widget";

const STEPS = [
  {
    key: "team",
    nav: "Team",
    label: "Step 1 of 5 · Team",
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
      "team.collegeOther",
      "team.district",
      "team.branch",
      "team.year",
      "team.idCardPath",
    ] satisfies Path<RegistrationForm>[],
  },
  {
    key: "members",
    nav: "Members",
    label: "Step 2 of 5 · Members",
    title: "Your team",
    subtitle: "Between 2 and 5 members total, all from the same college.",
    cta: "Continue to your idea",
    fields: ["members"] satisfies Path<RegistrationForm>[],
  },
  {
    key: "idea",
    nav: "Idea",
    label: "Step 3 of 5 · Idea",
    title: "Your idea",
    subtitle: "These four answers become your Stage 1 deck. No prototype needed.",
    cta: "Continue to review",
    fields: [
      "idea.problemStatement",
      "idea.proposedSolution",
      "idea.aiApproach",
      "idea.expectedImpact",
      "idea.supportingLink",
      "idea.deckPath",
    ] satisfies Path<RegistrationForm>[],
  },
  {
    key: "review",
    nav: "Review",
    label: "Step 4 of 5 · Review",
    title: "Review everything",
    subtitle: "Check every section before declarations — use Edit to jump back and fix anything.",
    cta: "Continue to declarations",
    fields: [] satisfies Path<RegistrationForm>[],
  },
  {
    key: "declarations",
    nav: "Declarations",
    label: "Step 5 of 5 · Declarations",
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
      collegeOther: "",
      district: "",
      branch: "",
      year: "",
      idCardPath: "",
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

export function RegistrationWizard({ leaderEmail = "" }: { leaderEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Restore a saved draft after mount — not during useForm()/render, since
  // reading localStorage synchronously there would throw during SSR (this
  // is a client component, but still goes through SSR for the initial
  // HTML). One post-hydration flash (empty → restored) is expected and
  // matches the same "restore in useEffect" pattern already used for the
  // admin view-mode toggle in teams-browser.tsx.
  //
  // The server-side draft (tied to the signed-in leader, not one browser)
  // takes priority when one exists — that's the copy that's "there
  // whenever they log in," even on a different device. The local one is
  // just a same-session fallback for when there's no session yet, or the
  // server round trip fails.
  useEffect(() => {
    (async () => {
      if (leaderEmail) {
        const serverDraft = await loadRegistrationDraft();
        if (serverDraft) {
          form.reset(serverDraft.value);
          setStep(serverDraft.step);
          return;
        }
      }
      const draft = loadDraft();
      if (draft) {
        form.reset(draft.value);
        setStep(draft.step);
      }
    })();
    // Only ever run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave on every field change (one shared timer, reset on
  // each change, so a burst of keystrokes writes once, not per keystroke).
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = setTimeout(() => {
        saveDraft(value as RegistrationForm, step);
      }, 500);
    });
    return () => {
      subscription.unsubscribe();
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function jumpToStep(key: string) {
    const index = STEPS.findIndex((s) => s.key === key);
    if (index === -1) return;
    setStep(index);
    saveDraft(form.getValues(), index);
  }

  async function handleContinue() {
    const valid = await form.trigger(current.fields as Path<RegistrationForm>[]);
    if (!valid) return;

    if (!isLastStep) {
      const nextStep = step + 1;
      setStep(nextStep);
      // A bare step change with no field edits in between wouldn't trigger
      // the watch()-based autosave above, so save explicitly here too.
      saveDraft(form.getValues(), nextStep);
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
    clearDraft();
    toast.success("Registration submitted!");
    router.push(`/register/status/${result.accessToken}`);
  }

  function handleBack() {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      saveDraft(form.getValues(), prevStep);
    } else {
      router.push("/");
    }
  }

  // Explicit, deliberate save — unlike the silent local autosave above,
  // this is the durable, cross-device copy tied to the leader's signed-in
  // identity (see saveRegistrationDraft). Never validates first: the whole
  // point of a draft is that it can hold incomplete/invalid progress.
  async function handleSaveDraft() {
    setSavingDraft(true);
    const result = await saveRegistrationDraft(form.getValues(), step);
    setSavingDraft(false);
    if (result.success) {
      toast.success("Draft saved");
    } else {
      toast.error(result.error);
    }
  }

  // Available from any step, not just Team — a leader who signed in with
  // the wrong account shouldn't have to navigate back to Step 1 to fix it.
  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  const hint =
    current.key === "team"
      ? "Saves as you go"
      : current.key === "members"
        ? `${1 + form.watch("members").length} of 5 added`
        : current.key === "idea"
          ? "Saves as you go"
          : current.key === "review"
            ? "Nothing submitted yet"
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

          {leaderEmail && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-gignite-blue-pale px-4 py-2 text-[13px] text-gignite-blue lg:max-w-[760px]">
              <span>
                Signed in as <span className="font-semibold">{leaderEmail}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-none font-semibold hover:text-gignite-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-[9px] lg:hidden">
            <ProgressBar step={step} total={STEPS.length} />
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
            {current.key === "review" && <StepReview form={form} onEdit={jumpToStep} />}
            {current.key === "declarations" && <StepDeclarations form={form} />}
          </div>

          {isLastStep && (
            <div className="lg:max-w-[760px]">
              <TurnstileWidget onToken={setTurnstileToken} />
            </div>
          )}

          <div className="flex flex-col gap-3 lg:max-w-[760px] lg:flex-row-reverse lg:items-center">
            <div className="lg:flex-1">
              <PrimaryButton
                type="submit"
                disabled={submitting || (isLastStep && !readyToSubmit)}
                loading={submitting}
              >
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
            {leaderEmail && (
              <SecondaryButton type="button" onClick={handleSaveDraft} disabled={savingDraft}>
                {savingDraft ? "Saving…" : "Save draft"}
              </SecondaryButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
