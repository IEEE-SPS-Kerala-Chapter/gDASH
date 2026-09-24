/**
 * The original shared UI primitives, frozen for the admin/judge/staff side.
 * The participant pages (components/registration/ui.tsx) were restyled to
 * match the Gadgeon.ai site; the staff side keeps this look unchanged, so
 * it owns its own copy instead of re-exporting the public ones.
 */
import { forwardRef, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { InputHTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/gignite-logo.png"
      alt="gIGNITE"
      width={1100}
      height={451}
      priority
      className={cn("h-auto w-auto", className)}
    />
  );
}

/**
 * Faint graph-paper grid, fixed behind the page content — matches the
 * ".circuit-grid-overlay" background used on the gIGNITE landing page
 * (gIGNITE-UI repo, src/index.css), ported here so the registration and
 * staff-login pages read as the same product as the site that links to
 * them. Render it first, then wrap the actual content in `relative z-10`
 * so it paints above the overlay regardless of DOM stacking quirks.
 *
 * `faded` softens it further with a blur + lower opacity — used behind the
 * admin/staff dashboard, where the grid sits directly behind dense card
 * content and reads as busier than on the mostly-empty registration/login
 * pages; the sharp version stays the default everywhere else.
 */
export function GridBackground({ faded = false }: { faded?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 z-0", faded && "blur-[3px]")}
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        backgroundPosition: "center center",
        opacity: faded ? 0.6 : 1,
      }}
    />
  );
}

/**
 * Static 3-logo header bar — Gadgeon far-left (the sponsor, sized up so it
 * reads clearly), the FISAT IEEE Student Branch logo centered, and the
 * combined IEEE + SPS Kerala Chapter logo far-right. Sits in normal
 * document flow (not fixed/overlaid), so it never covers page content —
 * just pushes it down like a banner. Replaces the earlier scrolling
 * `MarqueeStrip`, which was only ever a placeholder for this.
 */
export function LogoHeaderBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative z-10 flex w-full items-center justify-between gap-4 border-b border-gignite-border bg-gignite-card px-6 py-3",
        className,
      )}
    >
      <Image
        src="/gadgeon-logo.png"
        alt="Gadgeon Smart Systems"
        width={190}
        height={64}
        className="h-12 w-auto flex-none sm:h-16"
      />
      <Image
        src="/fisat-sb-logo.png"
        alt="IEEE FISAT Student Branch"
        width={344}
        height={178}
        className="h-10 w-auto flex-none sm:h-14"
      />
      <Image
        src="/ieee_sps_kc_logo.png"
        alt="IEEE Signal Processing Society Kerala Chapter"
        width={436}
        height={141}
        className="h-10 w-auto flex-none sm:h-14"
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  trailing,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">
        {label}
      </label>
      {children}
      {trailing}
      {error ? (
        <span className="text-[13px] leading-[1.45] text-gignite-danger">{error}</span>
      ) : hint ? (
        <span className="text-[13px] leading-[1.45] text-gignite-text/70">{hint}</span>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-[10px] border-[1.5px] border-gignite-border bg-gignite-surface px-[15px] py-[13px] text-[16px] text-gignite-text outline-none transition-colors focus:border-gignite-blue focus:ring-[3px] focus:ring-gignite-blue/20";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, "resize-y font-body leading-[1.6]", className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, "cursor-pointer appearance-none", className)} {...props}>
        {children}
      </select>
    );
  },
);

/**
 * Small themed spinner — a single ring in the current text color, so it
 * reads correctly whether it's sitting on the black text of an active
 * PrimaryButton or the blue of an inline "Loading…" label. Used anywhere a
 * network round trip (sign-in, submit, an admin fetch-on-mount panel) would
 * otherwise leave the screen looking stuck with no feedback.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/** Pulsing placeholder block for route-level loading.tsx skeletons and any
 * other "content not ready yet" panel — pairs with Spinner above for the
 * two loading idioms used across the app (a full skeleton for a whole
 * screen/section still loading its shape, a spinner for a button/inline
 * action in flight). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-gignite-divider", className)} />;
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-center gap-2.5 rounded-[11px] px-6 py-4 font-heading text-[17px] font-bold transition-colors",
        disabled
          ? "cursor-not-allowed bg-gignite-border text-gignite-muted shadow-none"
          : "bg-gignite-accent text-black shadow-[0_3px_0_rgba(150,67,11,0.45)] hover:bg-gignite-accent-hover",
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-[10px] border-[1.5px] border-gignite-border-strong bg-transparent px-4 py-2 font-body text-[13px] font-semibold text-gignite-blue transition-colors hover:border-gignite-blue"
    >
      {children}
    </button>
  );
}

export function FormCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[18px] rounded-2xl border border-black/[0.08] bg-gignite-surface p-[22px] shadow-[0_2px_4px_rgba(44,44,44,0.05),0_16px_34px_rgba(32,65,154,0.09)] lg:border-black/[0.05] lg:p-8 lg:shadow-[0_1px_2px_rgba(44,44,44,0.03),0_8px_20px_rgba(32,65,154,0.05)]">
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-gignite-divider" />;
}
