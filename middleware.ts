import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getAppSurface, isStaffPath } from "@/lib/app-surface";

// Any path with no page behind it — rewriting here renders the app's normal
// 404 page with a real 404 status, so a blocked page looks like it simply
// doesn't exist rather than redirecting somewhere that hints at it.
const NOT_FOUND_PATH = "/__not-found";

/** Serves `pathname`'s page at the current URL (address bar unchanged), keeping the query string. */
function rewriteTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

/** Sends a plain page visit to `pathname`, keeping the query string. Only GETs: a
 * form/server-action POST to the old address is left to reach its page. */
function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const surface = getAppSurface();
  const { pathname } = request.nextUrl;
  const isGet = request.method === "GET";

  if (surface === "staff") {
    // The bare staff domain *is* the sign-in page; /login still works but
    // is tidied to "/".
    if (pathname === "/") {
      const res = rewriteTo(request, "/login");
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
    if (pathname === "/login" && isGet) {
      return redirectTo(request, "/");
    }
    if (!isStaffPath(pathname)) {
      const res = NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { status: 404 });
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
    // Keep the staff site out of search engines.
    const res = await updateSession(request);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  if (surface === "public" && isStaffPath(pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { status: 404 });
  }

  // Participant site (and "all"): the bare domain *is* the registration
  // page. Old /register links still work — they're tidied to "/". Status
  // links (/register/status/…) are untouched.
  if (pathname === "/register" && isGet) {
    return redirectTo(request, "/");
  }
  if (pathname === "/") {
    // Refresh the Supabase session first (it updates the request's cookies
    // for the page and sets them on its response), then serve the
    // registration page with those same cookies.
    const session = await updateSession(request);
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    const rewrite = NextResponse.rewrite(url, { request: { headers: request.headers } });
    session.cookies.getAll().forEach((cookie) => rewrite.cookies.set(cookie));
    return rewrite;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes)
     * - any file with an extension (static assets, e.g. .svg, .png, .jpg)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
