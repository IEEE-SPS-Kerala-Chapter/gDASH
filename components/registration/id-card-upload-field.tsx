"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "./ui";
import { displayFileName } from "@/lib/upload-file-name";

const MAX_ID_CARD_BYTES = 8 * 1024 * 1024;
const ALLOWED_ID_CARD_TYPES = ["image/jpeg", "image/png", "image/webp"];

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; name: string }
  | { status: "done"; name: string }
  | { status: "error"; message: string };

/**
 * Reusable ID-card (identification photo) upload control — factored out of
 * step-idea.tsx's deck-upload logic, same shape: validate type/size
 * client-side, upload to a UUID-prefixed path via the anon browser client,
 * hand the resulting storage path back to the caller. Used once for the
 * leader (step-team.tsx) and once per row for additional members
 * (step-members.tsx). Only admins can ever view what's uploaded here — see
 * components/admin/id-card-panel.tsx.
 */
export function IdCardUploadField({
  path,
  onUploaded,
  error,
}: {
  /** Current storage path, if already uploaded — used to seed the "done" label after a draft restore. */
  path?: string;
  onUploaded: (path: string) => void;
  error?: string;
}) {
  const [state, setState] = useState<UploadState>(
    path ? { status: "done", name: displayFileName(path) } : { status: "idle" },
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_ID_CARD_TYPES.includes(file.type)) {
      setState({ status: "error", message: "Only JPG, PNG, or WEBP images are accepted." });
      return;
    }
    if (file.size > MAX_ID_CARD_BYTES) {
      setState({ status: "error", message: "File is larger than 8 MB." });
      return;
    }

    setState({ status: "uploading", name: file.name });
    const supabase = createClient();
    const uploadPath = `${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("member-id-cards").upload(uploadPath, file);

    if (uploadError) {
      setState({ status: "error", message: "Upload failed. Try again." });
      return;
    }
    onUploaded(uploadPath);
    setState({ status: "done", name: file.name });
  }

  return (
    <div className="flex flex-col gap-[7px]">
      <label className="font-ui text-[13px] font-semibold text-ignite-ink-soft">
        College ID card (for eligibility checks — visible only to organizers)
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-ignite-edge/[0.18] bg-ignite-bg px-[15px] py-[13px]">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(ev) => handleFile(ev.target.files?.[0])}
        />
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg bg-ignite-lavender font-ui text-[10px] font-medium text-ignite-ink">
          {state.status === "uploading" ? <Spinner /> : "ID"}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-ignite-ink">
            {state.status === "uploading"
              ? `Uploading ${state.name}…`
              : state.status === "done"
                ? `Uploaded: ${state.name}`
                : "Upload a clear photo of your college ID card"}
          </span>
          <span className="text-[12px] text-ignite-muted">
            {state.status === "error" ? state.message : "JPG, PNG, or WEBP · 8 MB max"}
          </span>
        </div>
      </label>
      {error && <span data-field-error role="alert" className="text-[13px] leading-[1.45] text-ignite-danger">{error}</span>}
    </div>
  );
}
