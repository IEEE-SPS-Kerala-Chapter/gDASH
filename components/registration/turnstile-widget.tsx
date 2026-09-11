"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Renders nothing if Turnstile isn't configured yet (dev-friendly — the
 * Server Action skips verification the same way when TURNSTILE_SECRET_KEY
 * is unset). Set NEXT_PUBLIC_TURNSTILE_SITE_KEY before going live publicly.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current || !window.turnstile) return;
    const el = containerRef.current;
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
    });
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onReady={() => {
          if (containerRef.current && window.turnstile && !widgetIdRef.current) {
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
              sitekey: SITE_KEY,
              callback: (token) => onToken(token),
              "expired-callback": () => onToken(null),
            });
          }
        }}
      />
      <div ref={containerRef} />
    </>
  );
}
