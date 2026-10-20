import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit-log";

const STAFF_ROLES = ["admin", "judge", "volunteer", "super_admin"];

/**
 * Return address for staff "Sign in with Google" (startStaffGoogleSignIn in
 * app/actions/auth.ts). Exchanges the code for a session, then lets the
 * person in only if that account has a staff profile — which only the
 * super-admin can create. Anyone else (a Google account that isn't on the
 * Staff page, or a team leader) is signed straight back out. The dashboard
 * layout then applies the usual password-reset and 2FA steps.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const back = (reason: string) => NextResponse.redirect(`${origin}/login?google=${reason}`);

  if (!code) return back("failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back("failed");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    await supabase.auth.signOut();
    return back("not_staff");
  }

  await logAuditEvent(supabase, "auth.signed_in", { metadata: { method: "google" } });
  return NextResponse.redirect(`${origin}/dashboard`);
}
