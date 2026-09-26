"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { createClient } from "@/lib/supabase/client";
import { Field, TextArea, FormCard, Spinner } from "./ui";
import { cn } from "@/lib/utils";
import { displayFileName } from "@/lib/upload-file-name";
import { buildUploadPath } from "@/lib/upload-path";

const MAX_DECK_BYTES = 20 * 1024 * 1024;
const ALLOWED_DECK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const DECK_TEMPLATE_URL = "https://canva.link/77trykluwr2sb8w";

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
    const supabase = createClient();
    // Uploads go in the leader's own folder — the only place storage lets
    // a signed-in user write (see lib/upload-path.ts).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadState({ status: "error", message: "Your session has expired. Sign in again to upload." });
      return;
    }
    const path = buildUploadPath(user.id, file.name);
    const { error } = await supabase.storage.from("registration-decks").upload(path, file);

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
      <Field label="Problem statement" error={e?.problemStatement?.message}>
        <TextArea rows={4} {...register("idea.problemStatement")} />
        <CharCount guidance="Who has this problem today, and how do they cope?" value={values.problemStatement} min={50} />
      </Field>

      <Field label="Proposed solution" error={e?.proposedSolution?.message}>
        <TextArea rows={4} {...register("idea.proposedSolution")} />
        <CharCount guidance="What you'll build and how it solves the problem." value={values.proposedSolution} min={50} />
      </Field>

      <Field label="AI approach / technology" error={e?.aiApproach?.message}>
        <TextArea rows={3} {...register("idea.aiApproach")} />
        <CharCount guidance="Models, data and why they fit." value={values.aiApproach} min={30} />
      </Field>

      <Field label="Expected impact" error={e?.expectedImpact?.message}>
        <TextArea rows={3} {...register("idea.expectedImpact")} />
        <CharCount guidance="Who benefits, and how you'd measure it." value={values.expectedImpact} min={30} />
      </Field>

      <Field
        label="Supporting material"
        hint={
          <>
            Required — build your deck from{" "}
            <a
              href={DECK_TEMPLATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ignite-ink underline hover:text-ignite-magenta"
            >
              the official pitch deck template
            </a>
            , then upload it as a PDF or PPTX.
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
                  : "Upload your deck"}
            </span>
            <span className="text-[12px] text-ignite-muted">
              {uploadState.status === "error" ? uploadState.message : "PDF or PPTX · 20 MB max"}
            </span>
          </div>
        </label>
      </Field>
    </FormCard>
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
