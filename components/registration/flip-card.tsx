"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HERO_CARD_CLASS } from "./ui";

// useLayoutEffect warns during SSR; this component only measures in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A card with two faces that flips (3D, around the vertical axis) between
 * them. The card's height animates to fit whichever face is showing.
 *
 * The hidden face is `inert`, so it can't be tabbed into or read by a screen
 * reader, and focus moves to the face that just turned around: to an
 * element marked `data-flip-focus` if it has one, otherwise its first
 * focusable element (skipped on first render). With the device's
 * reduced-motion setting on, the switch is instant.
 */
export function FlipCard({ flipped, front, back }: { flipped: boolean; front: ReactNode; back: ReactNode }) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const didMount = useRef(false);

  // Track the showing face's height, including while its content changes
  // (e.g. the email step becoming the code step, or an error appearing).
  useIsoLayoutEffect(() => {
    const active = flipped ? backRef.current : frontRef.current;
    if (!active) return;
    const update = () => setHeight(active.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(active);
    return () => observer.disconnect();
  }, [flipped]);

  useEffect(() => {
    const [shown, hidden] = flipped ? [backRef.current, frontRef.current] : [frontRef.current, backRef.current];
    if (hidden) hidden.inert = true;
    if (shown) shown.inert = false;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    // Let the flip get under way before moving focus, so the browser doesn't
    // scroll to a face that's still turned away.
    const t = window.setTimeout(() => {
      const target =
        shown?.querySelector<HTMLElement>("[data-flip-focus]") ??
        shown?.querySelector<HTMLElement>("input, button, a[href]");
      target?.focus({ preventScroll: true });
    }, 250);
    return () => window.clearTimeout(t);
  }, [flipped]);

  const face = cn(
    "left-0 right-0 top-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]",
    HERO_CARD_CLASS,
  );

  return (
    <div className="[perspective:1600px]">
      <div
        className="relative transition-[transform,height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
        style={{
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          height: height ?? undefined,
        }}
      >
        {/* The showing face sits in the flow (so the page never collapses
            before measuring); the other is laid over it. */}
        <div ref={frontRef} aria-hidden={flipped} className={cn(face, flipped ? "absolute" : "relative")}>
          {front}
        </div>
        <div
          ref={backRef}
          aria-hidden={!flipped}
          className={cn(face, "[transform:rotateY(180deg)]", flipped ? "relative" : "absolute")}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
