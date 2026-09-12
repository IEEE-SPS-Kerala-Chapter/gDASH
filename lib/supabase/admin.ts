import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. Server-only, never import
 * this from a Client Component or expose it to the browser.
 *
 * Used sparingly, and only from code paths that have already independently
 * verified the caller is staff (e.g. app/actions/admin.ts) — this client
 * itself enforces nothing, so every call site is responsible for its own
 * authorization check before using it.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
