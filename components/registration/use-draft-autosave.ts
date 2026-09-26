"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { saveRegistrationDraft } from "@/app/actions/registration";
import type { RegistrationForm } from "@/lib/validations/registration";

const DEBOUNCE_MS = 2000;
const RETRY_MS = 5000;
const TOAST_ID = "draft-autosave";

export const OFFLINE_SAVE_MESSAGE =
  "Couldn't save your progress — check your internet connection. We'll keep retrying, so don't close this page.";

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

/**
 * Autosaves the registration form to the leader's server-side draft
 * (registration_drafts) — the only copy of their progress; nothing is kept
 * in the browser, so a shared device holds no one's details.
 *
 * - schedule(): debounced save after edits (one write per burst of typing).
 * - saveNow(): immediate save (step changes, the "Save draft" button).
 * - One request at a time; edits made mid-request are saved right after.
 * - A failed save says why (no connection vs. anything else), retries every
 *   few seconds and as soon as the browser reports it's back online, and
 *   confirms once the progress is saved again.
 * - pause(): stops all saving (submit, sign-out) — also silences errors,
 *   since a request finishing after sign-out would fail with no session.
 */
export function useDraftAutosave({
  enabled,
  getValues,
  getStep,
}: {
  enabled: boolean;
  getValues: () => RegistrationForm;
  getStep: () => number;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pending = useRef(false); // edits not yet sent
  const inFlight = useRef<Promise<boolean> | null>(null);
  const failing = useRef(false); // last attempt failed
  const paused = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest callbacks, read at send time.
  const getValuesRef = useRef(getValues);
  const getStepRef = useRef(getStep);
  getValuesRef.current = getValues;
  getStepRef.current = getStep;

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    debounceTimer.current = null;
    retryTimer.current = null;
  }, []);

  const fail = useCallback((message: string) => {
    pending.current = true; // still unsaved — the retry sends it again
    if (paused.current) return;
    setStatus(message === OFFLINE_SAVE_MESSAGE ? "offline" : "error");
    setErrorMessage(message);
    // Toast only on the transition into failure, not on every retry.
    if (!failing.current) toast.error(message, { id: TOAST_ID, duration: 8000 });
    failing.current = true;
  }, []);

  // Sends the latest values, repeating while more edits arrived mid-request.
  // Resolves true once everything so far is saved.
  const send = useCallback(async (): Promise<boolean> => {
    while (pending.current && !paused.current) {
      pending.current = false;
      setStatus("saving");

      if (!navigator.onLine) {
        fail(OFFLINE_SAVE_MESSAGE);
        return false;
      }
      let result: Awaited<ReturnType<typeof saveRegistrationDraft>>;
      try {
        result = await saveRegistrationDraft(getValuesRef.current(), getStepRef.current());
      } catch {
        // The server action request itself never completed — in practice
        // a dropped or flaky connection.
        fail(OFFLINE_SAVE_MESSAGE);
        return false;
      }
      if (!result.success) {
        fail(result.error);
        return false;
      }
    }
    if (paused.current) return false;
    if (failing.current) toast.success("Back online — your progress is saved.", { id: TOAST_ID });
    failing.current = false;
    setErrorMessage(null);
    setStatus("saved");
    return true;
  }, [fail]);

  const run = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      // The running request picks this up when it finishes.
      pending.current = true;
      return inFlight.current;
    }
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const task = (async () => {
      try {
        return await send();
      } finally {
        // Cleared before anyone awaiting this sees the result, so a save
        // requested right after starts a new request instead of reusing this one.
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    const ok = await task;
    if (!ok && !paused.current) {
      retryTimer.current = setTimeout(() => void run(), RETRY_MS);
    }
    return ok;
  }, [send]);

  const schedule = useCallback(() => {
    if (!enabled || paused.current) return;
    pending.current = true;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void run(), DEBOUNCE_MS);
  }, [enabled, run]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!enabled || paused.current) return false;
    pending.current = true;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    return run();
  }, [enabled, run]);

  /** Stops saving and waits for any request already on its way. */
  const pause = useCallback(async () => {
    paused.current = true;
    clearTimers();
    await inFlight.current;
  }, [clearTimers]);

  const resume = useCallback(() => {
    paused.current = false;
  }, []);

  // Retry the moment the browser reports the connection is back.
  useEffect(() => {
    const onOnline = () => {
      if (enabled && pending.current && !paused.current) void run();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, run]);

  // Warn before leaving with changes the server doesn't have yet.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!paused.current && (pending.current || inFlight.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  return { status, errorMessage, schedule, saveNow, pause, resume };
}
