"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { createClient } from "@/lib/supabase/client";
import { Field, TextArea, FormCard, Spinner } from "./ui";
import { cn } from "@/lib/utils";

const MAX_DECK_BYTES = 20 * 1024 * 1024;
const ALLOWED_DECK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export function StepIdea({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const e = errors.idea;
  const problem = watch("idea.problemStatement") ?? "";
  const deckPath = watch("idea.deckPath");

  const [uploadState, setUploadState] = useState<
    { status: "idle" } | { status: "uploading"; name: string } | { status: "done"; name: string } | { status: "error"; message: string }
  >(deckPath ? { status: "done", name: deckPath.split("/").pop() ?? "deck" } : { status: "idle" });

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
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("registration-decks").upload(path, file);

    if (error) {
      setUploadState({ status: "error", message: "Upload failed. Try again." });
      return;
    }
    setValue("idea.deckPath", path, { shouldValidate: true });
    setUploadState({ status: "done", name: file.name });
  }

  const len = problem.length;
  const problemColor = len > 1500 ? "text-gignite-danger" : len > 1275 ? "text-gignite-warn" : "text-gignite-muted";

  return (
    <FormCard>
      <Field label="15 · Problem statement" error={e?.problemStatement?.message}>
        <TextArea rows={4} {...register("idea.problemStatement")} />
        <div className="flex items-start justify-between gap-3">
          <span className="flex-1 text-[13px] leading-[1.45] text-gignite-text/70">
            Who has this problem today, and how do they cope?
          </span>
          <span className={cn("flex-none font-mono text-[12px]", problemColor)}>{len} / 1500</span>
        </div>
      </Field>

      <Field label="16 · Proposed solution" error={e?.proposedSolution?.message}>
        <TextArea rows={4} {...register("idea.proposedSolution")} />
      </Field>

      <Field
        label="17 · AI approach / technology"
        hint="Models, data and why they fit — judges weight this at 25%."
        error={e?.aiApproach?.message}
      >
        <TextArea rows={3} {...register("idea.aiApproach")} />
      </Field>

      <Field label="18 · Expected impact" error={e?.expectedImpact?.message}>
        <TextArea rows={3} {...register("idea.expectedImpact")} />
      </Field>

      <Field label="19 · Supporting material" error={e?.supportingLink?.message}>
        <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-gignite-border-strong bg-gignite-card px-[15px] py-[13px]">
          <input
            type="file"
            accept=".pdf,.pptx"
            className="hidden"
            onChange={(ev) => handleFile(ev.target.files?.[0])}
          />
          <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg bg-gignite-blue-pale font-mono text-[10px] font-medium text-gignite-blue">
            {uploadState.status === "uploading" ? <Spinner /> : "PPT"}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-black">
              {uploadState.status === "uploading"
                ? `Uploading ${uploadState.name}…`
                : uploadState.status === "done"
                  ? `Uploaded: ${uploadState.name}`
                  : "Upload your deck"}
            </span>
            <span className="text-[12px] text-gignite-text/70">
              {uploadState.status === "error" ? uploadState.message : "PDF or PPTX · 20 MB max · optional"}
            </span>
          </div>
        </label>
      </Field>
    </FormCard>
  );
}
