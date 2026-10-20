"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { createClient } from "@/lib/supabase/client";
import { Field, TextArea, FormCard, Spinner } from "./ui";
import { cn } from "@/lib/utils";
import { displayFileName } from "@/lib/upload-file-name";
import { createUploadUrl } from "@/app/actions/uploads";
import { ExternalLink, Presentation } from "lucide-react";

const MAX_DECK_BYTES = 20 * 1024 * 1024;
const ALLOWED_DECK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const DECK_TEMPLATE_URL = "https://docs.google.com/presentation/d/131gSVctKwqtEYeG9JiWsmXSEDMM98I4F/edit?slide=id.p1#slide=id.p1";

export function StepIdea({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const e = errors.idea;
  const deckPath = watch("idea.deckPath");

  const [uploadState, setUploadState] = useState<
    { status: "idle" } | { status: "uploading"; name: string } | { status: "done"; name: string } | { status: "error"; message: string }
  >(deckPath ? { status: "done", name: displayFileName(deckPath) } : { status: "idle" });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_DECK_TYPES.includes(file.type)) {
      setUploadState({ status: "error", message: "Only PDF or PPTX files are accepted." });
      return;
    }
    if (file.size > MAX_DECK_BYTES) {
      setUploadState({ status: "error", message: "File is larger than 20 MB." });
      return;
    }

    setUploadState({ status: "uploading", name: file.name });
    // The server issues a one-time upload link into the leader's own folder
    // (the session cookie is HttpOnly, so it can't be used from here).
    const link = await createUploadUrl("deck", file.name).catch(() => null);
    if (!link || !link.success) {
      setUploadState({ status: "error", message: link && !link.success ? link.error : "Upload failed. Try again." });
      return;
    }
    const path = link.path;
    const { error } = await createClient()
      .storage.from("registration-decks")
      .uploadToSignedUrl(link.path, link.token, file, { contentType: file.type });

    if (error) {
      setUploadState({ status: "error", message: "Upload failed. Try again." });
      return;
    }
    setValue("idea.deckPath", path, { shouldValidate: true });
    setUploadState({ status: "done", name: file.name });
  }

  const values = {
    problemStatement: watch("idea.problemStatement") ?? "",
    proposedSolution: watch("idea.proposedSolution") ?? "",
    aiApproach: watch("idea.aiApproach") ?? "",
    expectedImpact: watch("idea.expectedImpact") ?? "",
  };

  return (
    <FormCard>
      <DeckTemplateCallout />

      <Field label="01 — The Problem" error={e?.problemStatement?.message}>
        <TextArea rows={4} {...register("idea.problemStatement")} />
        <CharCount
          guidance="What's the problem? Who faces it, and how are they dealing with it today?"
          value={values.problemStatement}
          min={50}
        />
      </Field>

      <Field label="02 — Your Solution" error={e?.proposedSolution?.message}>
        <TextArea rows={4} {...register("idea.proposedSolution")} />
        <CharCount guidance="What will your squad build, and how will it solve the problem?" value={values.proposedSolution} min={50} />
      </Field>

      <Field label="03 — AI + Tech" error={e?.aiApproach?.message}>
        <TextArea rows={3} {...register("idea.aiApproach")} />
        <CharCount guidance="What AI models, data, and tech will you use — and why do they fit?" value={values.aiApproach} min={30} />
      </Field>

      <Field label="04 — The Impact" error={e?.expectedImpact?.message}>
        <TextArea rows={3} {...register("idea.expectedImpact")} />
        <CharCount guidance="Who benefits, and how will you measure the impact?" value={values.expectedImpact} min={30} />
      </Field>

      <Field
        label="📎 Drop Your Deck — built on the official gIGNITE template"
        hint={
          <>
            Decks that don&apos;t use{" "}
            <a
              href={DECK_TEMPLATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ignite-ink underline hover:text-ignite-magenta"
            >
              the official template
            </a>{" "}
            may not be evaluated. Fill in the template, then upload it here.
          </>
        }
        error={e?.deckPath?.message}
      >
        <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-ignite-edge/[0.18] bg-ignite-bg px-[15px] py-[13px]">
          <input
            type="file"
            accept=".pdf,.pptx"
            className="hidden"
            onChange={(ev) => handleFile(ev.target.files?.[0])}
          />
          <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg bg-ignite-lavender font-ui text-[10px] font-medium text-ignite-ink">
            {uploadState.status === "uploading" ? <Spinner /> : deckBadge(uploadState)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-ignite-ink">
              {uploadState.status === "uploading"
                ? `Uploading ${uploadState.name}…`
                : uploadState.status === "done"
                  ? `Uploaded: ${uploadState.name}`
                  : "Upload Deck"}
            </span>
            <span className="text-[12px] text-ignite-muted">
              {uploadState.status === "error"
                ? uploadState.message
                : "Official gIGNITE template only · PDF or PPTX · 20 MB max"}
            </span>
          </div>
        </label>
      </Field>
    </FormCard>
  );
}

/**
 * Up-front notice that the deck has to be built on our template: shown at the
 * top of the step, before the questions, so teams see it before they start
 * designing slides of their own.
 */
function DeckTemplateCallout() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-ignite-magenta/60 bg-ignite-magenta/[0.07] p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-ignite-magenta text-white">
        <Presentation className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-ui text-[11px] font-bold uppercase tracking-[0.08em] text-ignite-magenta">
          Mandatory · Official template
        </span>
        <span className="text-[15px] font-semibold leading-[1.35] text-ignite-ink">
          Your pitch deck must be built on the official gIGNITE template.
        </span>
        <span className="text-[13px] leading-[1.45] text-ignite-muted">
          Make a copy (File → Make a copy, or File → Download as PPTX), fill in each slide, and upload it at the end
          of this step. Decks made from any other template may not be evaluated.
        </span>
      </div>
      <a
        href={DECK_TEMPLATE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-none items-center justify-center gap-2 rounded-full bg-ignite-primary px-5 py-2.5 font-ui text-[14px] font-bold text-ignite-on-primary transition-colors hover:bg-ignite-primary-hover"
      >
        Get the template
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
}

const IDEA_MAX_CHARS = 1500;

/** Guidance on the left; live count on the right, with the minimum shown up front rather than only as an error. */
function CharCount({ guidance, value, min }: { guidance: string; value: string; min: number }) {
  const len = value.length;
  const color =
    len > IDEA_MAX_CHARS
      ? "text-ignite-danger"
      : len > IDEA_MAX_CHARS * 0.85
        ? "text-ignite-warn"
        : len > 0 && len < min
          ? "text-ignite-warn"
          : "text-ignite-muted";
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex-1 text-[13px] leading-[1.45] text-ignite-muted">{guidance}</span>
      <span className={cn("flex-none font-ui text-[12px]", color)}>
        {len < min ? `min ${min} · ` : ""}
        {len} / {IDEA_MAX_CHARS}
      </span>
    </div>
  );
}

function deckBadge(state: { status: string; name?: string }): string {
  if (state.status !== "done" || !state.name) return "DECK";
  const lower = state.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".pptx")) return "PPTX";
  return "DECK";
}
