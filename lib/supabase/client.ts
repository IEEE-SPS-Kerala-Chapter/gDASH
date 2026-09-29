import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, withSessionMaxAge } from "./cookie-options";

/**
 * Supabase client for use in Client Components / the browser.
 * Safe to call multiple times — each call returns a new client backed
 * by the same singleton auth/session state in the browser.
 *
 * Cookies are read and written here rather than by the library's built-in
 * document.cookie handling so the sign-in cookie gets the same Secure flag
 * and 7-day lifetime as on the server (see lib/supabase/cookie-options.ts).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serializeCookieHeader(name, value, withSessionMaxAge(options));
          });
        },
      },
    },
  );
}
