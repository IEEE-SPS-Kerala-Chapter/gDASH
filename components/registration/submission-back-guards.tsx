"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cameFromBackForward, clearSignedOutFrom, readSubmitted, signedOutFrom } from "@/lib/submitted-registration";

/**
 * Rendered on the status page. When this tab just submitted the team shown
 * here, the browser's Back button stays on the status page instead of
 * returning to the registration form: an extra history entry for this same
 * URL is added, and each Back that lands on it adds it again.
 *
 * Opening the status link any other way (bookmark, email, another device)
 * leaves Back working normally.
 *
 * It also finishes the job of signing out: once the leader signed out from
 * this status page in this tab, coming back to it without a session (e.g.
 * with Back) goes to the register sign-in screen instead of showing the
 * team's details again. Signing back in lifts that.
 */
export function StatusBackGuard() {
  useEffect(() => {
    const statusPath = window.location.pathname;

    // Signed out from this page in this tab: don't show the team's details
    // again without a session (checked live — a restored page may have been
    // rendered while the leader was still signed in).
    function leaveIfSignedOut() {
      if (signedOutFrom() !== statusPath) return false;
      void createClient()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) clearSignedOutFrom();
          else window.location.replace("/register");
        });
      return true;
    }

    // Back can also restore this page from the browser's back-forward cache
    // without re-running effects; pageshow still fires then.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) leaveIfSignedOut();
    };
    window.addEventListener("pageshow", onPageShow);

    if (leaveIfSignedOut()) {
      return () => window.removeEventListener("pageshow", onPageShow);
    }

    const submitted = readSubmitted();
    if (!submitted || submitted.statusUrl !== statusPath) {
      return () => window.removeEventListener("pageshow", onPageShow);
    }

    // Next.js copies its own routing state onto this entry (it wraps
    // pushState), so going Back to it just re-shows this same page.
    window.history.pushState(null, "", window.location.href);

    function onPopState() {
      if (window.location.pathname === statusPath) {
        window.history.pushState(null, "", window.location.href);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}

/**
 * Backup for the registration and sign-in screens: if this tab just
 * submitted a team and the screen was reached with Back/Forward (e.g. by
 * jumping several entries back through the browser's history menu), go
 * straight to that team's status page instead of showing a new form.
 * A normal visit to /register is unaffected.
 */
export function RegisterBackGuard() {
  const router = useRouter();

  useEffect(() => {
    function check(persisted: boolean) {
      const submitted = readSubmitted();
      if (submitted && cameFromBackForward(persisted)) {
        router.replace(submitted.statusUrl);
      }
    }
    check(false);
    const onPageShow = (e: PageTransitionEvent) => check(e.persisted);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
