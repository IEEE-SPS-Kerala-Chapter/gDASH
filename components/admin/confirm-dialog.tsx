"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Spinner } from "@/components/admin/ui";

/**
 * A warning pop-up for actions that can't be undone. Escape or clicking
 * outside cancels (unless the action is running); focus starts on Cancel so
 * a stray Enter doesn't confirm.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !busy && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] border-t-4 border-ignite-danger bg-ignite-surface p-6 font-ui shadow-2xl"
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ignite-danger-pale text-[18px] font-bold text-ignite-danger"
          >
            !
          </span>
          <h2 id="confirm-dialog-title" className="m-0 font-display text-[19px] font-bold text-ignite-ink">
            {title}
          </h2>
        </div>
        <div className="flex flex-col gap-2 text-[14px] leading-[1.55] text-ignite-ink-soft">{children}</div>
        <p className="m-0 rounded-xl bg-ignite-danger-pale px-3 py-2 text-[14px] font-semibold text-ignite-danger">
          This can&apos;t be undone. Once deleted, it can&apos;t be changed or restored.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-ignite-ink/70 px-5 py-2.5 text-[14px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-lavender disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-full bg-ignite-danger px-5 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Spinner />}
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
