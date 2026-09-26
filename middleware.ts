import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getAppSurface, isStaffPath } from "@/lib/app-surface";

// Any path with no page behind it — rewriting here renders the app's normal
// 404 page with a real 404 status, so a blocked page looks like it simply
// doesn't exist rather than redirecting somewhere that hints at it.
const NOT_FOUND_PATH = "/__not-found";

export async function middleware(request: NextRequest) {
  const surface = getAppSurface();
  const { pathname } = request.nextUrl;

  if (surface === "public" && isStaffPath(pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { status: 404 });
  }

  if (surface === "staff") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", request.url));
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
