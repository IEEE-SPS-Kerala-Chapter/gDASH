"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Participant sign-in on the server, so the Supabase session lives only in
 * HttpOnly cookies that page JavaScript can't read
 * (lib/supabase/cookie-options.ts).
 *
 * Sending and checking the email code still happen in the browser (with a
 * session-less client — lib/supabase/client.ts) so Supabase's per-IP rate
 * limits apply to each participant rather than to our server's few IPs;
 * the resulting session is handed over once via establishSession().
 */

/** Stores a session obtained in the browser (after a verified email code) as HttpOnly cookies. */
export async function establishSession(
  accessToken: string,
  refreshToken: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!accessToken || !refreshToken) {
    return { success: false, error: "Couldn't complete sign-in. Please try again." };
  }
  const supabase = await createClient();
  // setSession validates the access token with Supabase before storing it.
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.user) {
    return { success: false, error: "Couldn't complete sign-in. Please try again." };
  }
  return { success: true };
}

/** Whether the visitor has a valid session (used by the Back-button guard). */
export async function hasSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

/**
 * Starts "Continue with Google". The PKCE code verifier is stored as an
 * HttpOnly cookie here and read back by the /auth/callback route, which
 * exchanges the code server-side. The return address is built from this
 * request's own host, never from client input.
 */
export async function startGoogleSignIn(): Promise<{ success: true; url: string } | { success: false }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return { success: false };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${proto}://${host}/auth/callback?next=/`, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { success: false };
  return { success: true, url: data.url };
}
