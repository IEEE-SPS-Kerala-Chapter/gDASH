import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";

/** How long a sign-in cookie is kept: 7 days (the @supabase/ssr default is 400). */
export const AUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Attributes for the Supabase sign-in cookies (sb-<project>-auth-token),
 * shared by the browser, server and middleware clients so they always
 * agree. The @supabase/ssr defaults leave out `Secure` and keep the
 * cookie for 400 days.
 *
 * - secure: only ever sent over HTTPS in production. Local development
 *   runs on http://localhost, where a Secure cookie wouldn't be stored.
 * - sameSite "lax": required — "strict" would drop the cookie on the
 *   return from Google sign-in.
 * - httpOnly stays false for now: the participant flows still use the
 *   browser Supabase client (email code, Google sign-in start, uploads,
 *   sign-out), which reads this cookie. Moving those server-side is the
 *   follow-up that lets it become HttpOnly.
 * - maxAge: @supabase/ssr ignores a maxAge given here and always writes
 *   its 400-day default, so the lifetime is applied where cookies are
 *   actually written — see withSessionMaxAge.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
};

/**
 * Applies the 7-day lifetime to a cookie being written. Deletions (maxAge 0)
 * are left alone, so signing out still clears the cookie.
 */
export function withSessionMaxAge(options: CookieOptions): CookieOptions {
  if (typeof options.maxAge === "number" && options.maxAge > 0) {
    return { ...options, maxAge: Math.min(options.maxAge, AUTH_SESSION_MAX_AGE) };
  }
  return options;
}
