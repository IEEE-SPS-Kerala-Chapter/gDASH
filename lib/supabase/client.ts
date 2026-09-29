import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Session-less Supabase client for the browser. It never stores or reads a
 * session: the sign-in cookies are HttpOnly (lib/supabase/cookie-options.ts),
 * so page JavaScript can't see them. Used only for calls that don't need a
 * signed-in user — sending and checking the email sign-in code (the new
 * session is then handed to the server via establishSession) and uploading
 * a file with a signed upload link (createUploadUrl).
 */
export function createClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
