// Registration progress used to be autosaved to localStorage under this key.
// It now lives only in the leader's server-side draft (registration_drafts,
// see useDraftAutosave), so nothing identifying stays on a shared device.
const LEGACY_DRAFT_KEY = "gignite-registration-draft-v1";

/** Removes any copy left in this browser by the old local autosave. */
export function purgeLegacyLocalDraft(): void {
  try {
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // ignore — storage unavailable (private browsing etc.)
  }
}
