import type { RegistrationForm } from "@/lib/validations/registration";

const DRAFT_KEY = "gignite-registration-draft-v1";
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — a registration window is short-lived.

type Draft = { value: RegistrationForm; step: number; savedAt: number };

/**
 * localStorage-backed draft for the registration wizard, so a reload
 * mid-form doesn't lose everything. Not critical data — every call is
 * try/catch guarded the same way as the existing gignite-admin-view-mode
 * pattern in teams-browser.tsx, since localStorage can throw (private
 * browsing, disabled storage) or simply be unavailable.
 */
export function saveDraft(value: RegistrationForm, step: number): void {
  try {
    const draft: Draft = { value, step, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore — private browsing etc.
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.value || typeof draft.savedAt !== "number") return null;
    if (Date.now() - draft.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
