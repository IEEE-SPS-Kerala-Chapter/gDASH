/**
 * One repo, deployed as two Vercel projects that each serve half the app,
 * chosen by the APP_SURFACE environment variable (set per Vercel project):
 *
 * - "public": the participant site — registration, status pages, ID-card
 *   pages. Staff pages 404, so the participant domain doesn't reveal them.
 * - "staff":  the staff site — login, dashboard, password reset only. Every
 *   participant page 404s, and "/" goes to the login page.
 * - unset:    everything is served, as before (local dev, and any
 *   deployment that hasn't been switched over yet).
 *
 * Both halves use the same Supabase project. Separate domains also keep a
 * staff session and a participant session from ever sharing cookies.
 */
export type AppSurface = "public" | "staff" | "all";

export function getAppSurface(): AppSurface {
  const value = process.env.APP_SURFACE?.trim().toLowerCase();
  return value === "public" || value === "staff" ? value : "all";
}

const STAFF_PATH_PREFIXES = ["/login", "/dashboard", "/reset-password"];

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
