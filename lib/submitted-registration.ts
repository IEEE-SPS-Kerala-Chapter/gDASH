// Tab-scoped record of the last successful submission (sessionStorage, so
// it lives only as long as this browser tab). Lets the Back button take a
// leader to the home page after submitting, instead of back to the
// registration form or sign-in screen (see submission-back-guards.tsx).

const SUBMITTED_KEY = "gignite-submitted";
// Status page this tab signed out from (see StatusBackGuard).
const SIGNED_OUT_KEY = "gignite-signed-out-status";

export type SubmittedRegistration = { email: string; statusUrl: string };

export function readSubmitted(): SubmittedRegistration | null {
  try {
    const raw = sessionStorage.getItem(SUBMITTED_KEY);
    return raw ? (JSON.parse(raw) as SubmittedRegistration) : null;
  } catch {
    return null;
  }
}

export function markSubmitted(record: SubmittedRegistration) {
  try {
    sessionStorage.setItem(SUBMITTED_KEY, JSON.stringify(record));
  } catch {
    // Private browsing etc. — the history replace() on submit still keeps
    // Back off the form itself.
  }
}

/** Forgets this tab's submission record (see RegistrationWizard: a record
 * seen there is stale, since the form only opens for an unregistered email). */
export function clearSubmitted() {
  try {
    sessionStorage.removeItem(SUBMITTED_KEY);
  } catch {
    // Nothing stored, or storage blocked.
  }
}

/**
 * Signing out from a status page: forget this tab's submission (so the
 * Back-button guards stop sending it to the status page) and remember
 * which status page was left, so Back can't bring its details up again.
 */
export function markSignedOutFrom(statusPath: string) {
  try {
    sessionStorage.removeItem(SUBMITTED_KEY);
    sessionStorage.setItem(SIGNED_OUT_KEY, statusPath);
  } catch {
    // Storage blocked — the sign-out redirect still happens.
  }
}

export function signedOutFrom(): string | null {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY);
  } catch {
    return null;
  }
}

export function clearSignedOutFrom() {
  try {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // Nothing stored, or storage blocked.
  }
}

/**
 * True when the current page was reached with the browser's Back/Forward
 * buttons — either a fresh load of this document (navigation type
 * "back_forward") or a restore from the back-forward cache (`persisted`
 * on the pageshow event, passed in by the caller).
 */
export function cameFromBackForward(persisted = false): boolean {
  if (persisted) return true;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "back_forward";
  } catch {
    return false;
  }
}
