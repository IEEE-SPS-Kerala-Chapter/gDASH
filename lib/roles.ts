/** Display labels for profiles.role, shared across the admin/judge/super-admin UI. */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  judge: "Judge",
  volunteer: "Volunteer",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Roles with admin-level access to team/registration management (everything but scoring). */
export const ADMIN_LEVEL_ROLES = ["admin", "super_admin"];

export function isAdminLevelRole(role: string): boolean {
  return ADMIN_LEVEL_ROLES.includes(role);
}
