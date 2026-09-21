export type RegistrationWindow = {
  isOpen: boolean;
  closesAt: string | null;
  closedMessage: string | null;
};

/**
 * Whether registration is open right now, folding in closesAt the same way
 * submit_registration() does at the database level — is_open alone isn't
 * enough once a scheduled closing date has passed.
 */
export function isRegistrationCurrentlyOpen(window: RegistrationWindow): boolean {
  if (!window.isOpen) return false;
  if (window.closesAt && new Date(window.closesAt).getTime() <= Date.now()) return false;
  return true;
}
