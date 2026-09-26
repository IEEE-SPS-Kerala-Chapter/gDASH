"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cameFromBackForward, clearSignedOutFrom, readSubmitted, signedOutFrom } from "@/lib/submitted-registration";

/**
 * Rendered on the status page. When this tab just submitted the team shown
 * here, the browser's Back button goes to the home page instead of back
 * into the registration flow (the form is gone — submitted, draft deleted —
 * and the leader was signed out on submit). An extra history entry for this
 * same URL is added; Back lands on the one underneath and replaces it with
 * the home page, so Forward still returns here. It used to keep Back on the
 * status page itself, which left no way to leave the site with Back.
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
          else window.location.replace("/");
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
        window.location.replace("/");
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
 * submitted a team and the screen was reached with Back/Forward (e.g. Back
 * again from the home page, or a jump through the browser's history menu),
 * go to the home page instead of showing a new form — same as Back from the
 * status page, so each Back keeps moving away from the finished flow. (The
 * status page stays one sign-in away, or on the leader's bookmark.)
 * A normal visit to /register is unaffected.
 */
export function RegisterBackGuard() {
  const router = useRouter();

  useEffect(() => {
    function check(persisted: boolean) {
      if (readSubmitted() && cameFromBackForward(persisted)) {
        router.replace("/");
      }
    }
    check(false);
    const onPageShow = (e: PageTransitionEvent) => check(e.persisted);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
