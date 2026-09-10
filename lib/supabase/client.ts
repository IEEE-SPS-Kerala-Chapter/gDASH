import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components / the browser.
 * Safe to call multiple times — each call returns a new client backed
 * by the same singleton auth/session state in the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
