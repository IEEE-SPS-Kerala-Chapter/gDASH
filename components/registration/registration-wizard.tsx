"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registrationFormSchema, type RegistrationForm } from "@/lib/validations/registration";
import { submitRegistration, loadRegistrationDraft } from "@/app/actions/registration";
import { purgeLegacyLocalDraft } from "@/lib/registration-draft";
import { markSubmitted, readSubmitted } from "@/lib/submitted-registration";
import { createClient } from "@/lib/supabase/client";
import { RULES_URL } from "@/lib/config";
import {
  WizardHeader,
  ProgressBar,
  StepMeta,
  StepTitle,
  PrimaryButton,
  SecondaryButton,
  DesktopSidebar,
  FormCard,
  Skeleton,
  Spinner,
  Eyebrow,
} from "./ui";
import { StepTeam } from "./step-team";
import { StepMembers } from "./step-members";
import { StepIdea } from "./step-idea";
import { StepReview } from "./step-review";
import { StepDeclarations } from "./step-declarations";
import { TurnstileWidget } from "./turnstile-widget";
import { useDraftAutosave, type SaveStatus } from "./use-draft-autosave";

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
    subtitle: "Answer four questions and upload your pitch deck. No prototype needed.",
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
  // Mirrors `step` synchronously, so a save fired in the same tick as a
  // step change sends the new step, not the one from the last render.
  const stepRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [openingStatus, setOpeningStatus] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // "loading" until the leader's saved draft has been checked. The form
  // stays hidden until then: an empty form meanwhile looked like nothing was
  // saved, anything typed into it would be overwritten once the draft
  // arrived — and with autosave, an empty form shown after a *failed*
  // lookup would overwrite the real draft on the first keystroke. So a
  // failed lookup shows "error" with a retry instead.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
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

  const autosave = useDraftAutosave({
    // No signed-in leader (only when LEADER_VERIFICATION_ENABLED is off) means
    // no identity to save a draft under.
    enabled: Boolean(leaderEmail) && loadState === "ready",
    getValues: () => form.getValues(),
    getStep: () => stepRef.current,
  });

  const current = STEPS[step];
  const decl = form.watch("declarations");
  const readyToSubmit = Boolean(decl?.eligibility && decl?.originality && decl?.rules);
  const isLastStep = step === STEPS.length - 1;
  const turnstileConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function restoreDraft() {
    setLoadState("loading");
    if (!leaderEmail) {
      setLoadState("ready");
      return;
    }
    let draft: Awaited<ReturnType<typeof loadRegistrationDraft>>;
    try {
      draft = await loadRegistrationDraft();
    } catch {
      // The request never completed — a dropped connection.
      draft = { status: "error" };
    }
    if (draft.status === "error") {
      setLoadState("error");
      return;
    }
    if (draft.status === "found") {
      form.reset(draft.value);
      stepRef.current = draft.step;
      setStep(draft.step);
    }
    setLoadState("ready");
  }

  useEffect(() => {
    // Progress used to be autosaved in this browser too; remove any such
    // leftover copy so a shared device keeps no one's details.
    purgeLegacyLocalDraft();
    // Only for the same leader: on a shared device, the next person signs in
    // with their own email and gets a fresh form as normal.
    const submitted = readSubmitted();
    if (submitted && leaderEmail && submitted.email === leaderEmail.toLowerCase()) {
      router.replace(submitted.statusUrl);
      return;
    }
    void restoreDraft();
    // Only ever run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = autosave.schedule;
  // Debounced autosave on every field change. Subscribed only once the draft
  // has loaded, so restoring it (form.reset) doesn't count as an edit.
  useEffect(() => {
    if (loadState !== "ready") return;
    const subscription = form.watch(() => scheduleSave());
    return () => subscription.unsubscribe();
  }, [loadState, form, scheduleSave]);

  // Step changes save straight away — a bare step change with no field
  // edits wouldn't trigger the watch()-based autosave above.
  function goToStep(index: number) {
    stepRef.current = index;
    setStep(index);
    void autosave.saveNow();
  }

  function jumpToStep(key: string) {
    const index = STEPS.findIndex((s) => s.key === key);
    if (index === -1) return;
    goToStep(index);
  }

  async function handleContinue() {
    const valid = await form.trigger(current.fields as Path<RegistrationForm>[], { shouldFocus: true });
    if (!valid) {
      revealFirstError();
      return;
    }

    if (!isLastStep) {
      goToStep(step + 1);
      return;
    }
    if (turnstileConfigured && !turnstileToken) {
      toast.error("Please complete the verification challenge.");
      return;
    }

    setSubmitting(true);
    // Submitting deletes the draft row; an autosave landing after that would
    // recreate it. So stop autosaving and let any save in flight finish first.
    await autosave.pause();
    const result = await submitRegistration(form.getValues(), {
      honeypot: honeypotRef.current?.value,
      turnstileToken,
    });
    if (!result.success) {
      setSubmitting(false);
      autosave.resume();
      toast.error(result.error);
      return;
    }
    // Deliberately stays "submitting" from here until the status page
    // replaces this one — resetting it earlier put the idle "Submit
    // registration" button back on screen during sign-out and navigation.
    setOpeningStatus(true);
    const statusUrl = `/register/status/${result.accessToken}`;
    markSubmitted({ email: leaderEmail.toLowerCase(), statusUrl });
    // The status page is looked up entirely by the access token in its own
    // URL — it needs no session at all — so there's no reason to leave the
    // leader signed in past this point. Matters most on a shared/public
    // device (e.g. a registration desk): without this, the next person to
    // open /register here would silently inherit this session. Best-effort:
    // a failure here shouldn't block a successful submission's redirect.
    try {
      await createClient().auth.signOut();
    } catch (err) {
      console.error("Sign-out after submit failed:", err);
    }
    toast.success("Registration submitted!");
    // replace, not push: the status page takes this form's place in the
    // browser history, so Back can't return to a stale, empty copy of it.
    router.replace(statusUrl);
  }

  // A failed Continue used to just return, which looked like a dead button:
  // the errors were often in a member card scrolled far above it, or on a
  // control shouldFocus can't reach (the ID-card upload has no input ref).
  // So scroll to the first rendered error, and always say what's wrong in a
  // toast — which also covers an error on a field that isn't on screen at
  // all (e.g. a hidden "Role (specify)" value restored from a draft).
  function revealFirstError() {
    const message = firstErrorMessage(form.formState.errors, current.fields);
    if (current.key === "members") {
      toast.error(membersStepError(form.getValues("members"), form.formState.errors.members, message));
    } else {
      toast.error(message ?? "Please fix the highlighted fields.");
    }
    requestAnimationFrame(() => {
      const el = document.querySelector("[data-field-error]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleBack() {
    if (step === 0) return;
    goToStep(step - 1);
  }

  // Same save as the autosave, on demand — for leaders who want to see it
  // confirmed. Never validates first: a draft can hold incomplete progress.
  // A failure already shows its own message (see useDraftAutosave).
  async function handleSaveDraft() {
    setSavingDraft(true);
    const saved = await autosave.saveNow();
    setSavingDraft(false);
    if (saved) toast.success("Draft saved");
  }

  // Available from any step, not just Team — a leader who signed in with
  // the wrong account shouldn't have to navigate back to Step 1 to fix it.
  async function handleSignOut() {
    setSigningOut(true);
    // Save what's unsaved while the session still exists, then stop, so a
    // late request can't fail with "session expired" after signing out.
    await autosave.saveNow();
    await autosave.pause();
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
      <DesktopSidebar
        steps={STEPS}
        step={step}
        onHome={() => router.push("/")}
        onStepClick={(i) => jumpToStep(STEPS[i].key)}
      />

      <div
        className={
          "flex w-full flex-col overflow-hidden rounded-[28px] border border-ignite-edge/[0.06] " +
          "bg-ignite-bg shadow-[0_18px_46px_rgba(44,29,68,0.10)] " +
          // Desktop drops the outer card entirely — the form sits directly on
          // the page background, so only the per-section field groups below
          // (FormCard) read as cards, not the whole panel doubled up.
          "lg:flex-1 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        }
      >
        <div className="lg:hidden">
          <WizardHeader onBack={handleBack} canGoBack={step > 0} />
        </div>
        <form
          // Our own messages (lib/validations/email.ts) instead of the
          // browser's built-in email check, which differs per browser.
          noValidate
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
            <div className="flex items-center justify-between gap-3 rounded-full border border-ignite-edge/[0.06] bg-ignite-surface px-5 py-2.5 font-ui text-[13px] text-ignite-ink-soft shadow-[0_1px_6px_rgba(0,0,0,0.05)] lg:max-w-[760px]">
              <span className="min-w-0 truncate">
                Signed in as <span className="font-semibold">{leaderEmail}</span>
              </span>
              <SaveIndicator status={autosave.status} />
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-none font-semibold hover:text-ignite-magenta disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}

          {loadState === "loading" ? (
            <RestoringDraft />
          ) : loadState === "error" ? (
            <DraftLoadFailed onRetry={() => void restoreDraft()} />
          ) : (
            <>
            <div className="flex flex-col gap-[9px] lg:hidden">
              <ProgressBar step={step} total={STEPS.length} />
              <StepMeta label={current.label} hint={hint} />
            </div>

            <div className="hidden items-baseline justify-between lg:flex lg:max-w-[760px]">
              <Eyebrow>{current.label}</Eyebrow>
              <span className="font-ui text-[12px] font-medium text-ignite-muted">{hint}</span>
            </div>

            <StepTitle title={current.title} subtitle={current.subtitle} />

            {/* Declarations already surfaces this inline, right next to the
                actual required checkbox — showing it again up here too would
                just be a second, redundant copy on that one screen. */}
            {current.key !== "declarations" && (
              <a
                href={RULES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit rounded-full border border-ignite-ink/70 bg-ignite-surface/60 px-4 py-[7px] font-ui text-[13px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-primary hover:text-ignite-on-primary"
              >
                Rules to follow ↗
              </a>
            )}

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

            {autosave.errorMessage && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-xl bg-ignite-danger-pale px-4 py-3 text-[14px] leading-[1.45] text-ignite-danger lg:max-w-[760px]"
              >
                <span>{autosave.errorMessage}</span>
                <button
                  type="button"
                  onClick={() => void autosave.saveNow()}
                  disabled={autosave.status === "saving"}
                  className="flex-none font-semibold underline disabled:opacity-60"
                >
                  {autosave.status === "saving" ? "Retrying…" : "Retry now"}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3 lg:max-w-[760px] lg:flex-row-reverse lg:items-center">
              <div className="lg:flex-1">
                <PrimaryButton
                  type="submit"
                  disabled={submitting || (isLastStep && !readyToSubmit)}
                  loading={submitting}
                >
                  {openingStatus ? "Opening your status page…" : submitting ? "Submitting…" : current.cta}
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
            </>
          )}
        </form>
      </div>
    </div>
  );
}

const MIN_TEAM_MESSAGE = "A team requires a minimum of 2 members.";

/**
 * Members-step toast: always leads with the 2-member minimum, since the
 * usual cause is the leader alone or a second member added but left blank —
 * then names which member card still needs work, and the first problem in it.
 */
function membersStepError(
  members: RegistrationForm["members"] | undefined,
  errors: unknown,
  firstMessage: string | undefined,
): string {
  if (!members?.length) {
    return `${MIN_TEAM_MESSAGE} Add a second member with their details to continue.`;
  }
  const index = Array.isArray(errors) ? errors.findIndex(Boolean) : -1;
  if (index === -1) return firstMessage ?? `${MIN_TEAM_MESSAGE} Complete every member's details to continue.`;
  return `${MIN_TEAM_MESSAGE} Complete Member ${index + 2}'s details to continue${firstMessage ? ` — ${firstMessage}` : "."}`;
}

/** First error message under any of `paths` in RHF's nested errors object (depth-first, in field order). */
function firstErrorMessage(errors: unknown, paths: readonly string[]): string | undefined {
  const find = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const { message } = node as { message?: unknown };
    if (typeof message === "string" && message) return message;
    for (const [key, child] of Object.entries(node)) {
      if (key === "ref") continue;
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const path of paths) {
    const node = path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], errors);
    const found = find(node);
    if (found) return found;
  }
  return undefined;
}

/** Small autosave state next to "Signed in as" — "Not saved" stays until a save succeeds (the banner above the buttons says why). */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Not saved";
  return (
    <span
      aria-live="polite"
      className={
        "ml-auto flex-none text-[12px] font-semibold " +
        (status === "offline" || status === "error" ? "text-ignite-danger" : "text-ignite-muted")
      }
    >
      {label}
    </span>
  );
}

function DraftLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-4 lg:max-w-[760px]">
      <FormCard>
        <p className="m-0 text-[15px] font-semibold text-ignite-ink">Couldn&apos;t load your saved progress</p>
        <p className="m-0 text-[14px] leading-[1.5] text-ignite-ink-soft">
          This is usually a weak or dropped internet connection. Check your connection and try again — your saved
          progress is safe and will load once you&apos;re back online.
        </p>
        <PrimaryButton type="button" onClick={onRetry}>
          Try again
        </PrimaryButton>
      </FormCard>
    </div>
  );
}

function RestoringDraft() {
  return (
    <div className="flex flex-col gap-[18px] lg:max-w-[760px]" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ignite-ink">
        <Spinner />
        Loading your saved progress…
      </div>
      <FormCard>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-full" />
      </FormCard>
    </div>
  );
}
