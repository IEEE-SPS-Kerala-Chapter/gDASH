import { forwardRef, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { InputHTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/gignite-logo.png"
      alt="gIGNITE"
      width={1100}
      height={451}
      priority
      // The logo's navy lettering disappears on dark backgrounds, so in the
      // dark theme it sits on a small white plate.
      className={cn("h-auto w-auto dark:rounded-xl dark:bg-white dark:p-1.5", className)}
    />
  );
}

/**
 * Soft page backdrop, fixed behind the content: the pale blue and magenta
 * glows the Gadgeon.ai site uses behind its light sections (see
 * gadgeon-design-reference.md). Render it first, then wrap the actual
 * content in `relative z-10` so it paints above it.
 *
 * `faded` lowers the glow further for dense screens.
 */
export function GridBackground({ faded = false }: { faded?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          "radial-gradient(60% 50% at 12% 18%, rgba(49,130,252,0.10), transparent 70%), radial-gradient(50% 55% at 90% 30%, rgba(199,86,217,0.08), transparent 70%), radial-gradient(60% 50% at 50% 100%, rgba(244,121,32,0.05), transparent 70%)",
        opacity: faded ? 0.6 : 1,
      }}
    />
  );
}

/**
 * 3-logo header bar — Gadgeon far-left (the sponsor, sized up so it reads
 * clearly), the FISAT IEEE Student Branch logo centered, and the combined
 * IEEE + SPS Kerala Chapter logo far-right. Sticky at the top of the page,
 * always white (the logos need it) in both themes, with the light/dark
 * theme toggle on its own row just below it.
 */
export function LogoHeaderBar({ className, onHero = false }: { className?: string; onHero?: boolean }) {
  return (
    <>
      <div className={cn("sticky top-0 z-30 w-full", className)}>
        <div
          // light-scope: the colour logos need a white bar in both themes.
          className="light-scope flex w-full items-center justify-between gap-3 border-b border-ignite-edge/[0.08] bg-ignite-surface px-4 py-3 sm:gap-4 sm:px-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)] lg:px-16"
        >
          <Image
            src="/gadgeon-logo.png"
            alt="Gadgeon Smart Systems"
            width={190}
            height={64}
            className="h-9 w-auto min-w-0 flex-shrink sm:h-16"
          />
          <Image
            src="/fisat-sb-logo.png"
            alt="IEEE FISAT Student Branch"
            width={344}
            height={178}
            className="h-8 w-auto min-w-0 flex-shrink sm:h-14"
          />
          <Image
            src="/ieee_sps_kc_logo.png"
            alt="IEEE Signal Processing Society Kerala Chapter"
            width={436}
            height={141}
            className="h-8 w-auto min-w-0 flex-shrink sm:h-14"
          />
        </div>
      </div>
      {/* Theme toggle on its own row just below the bar, so page content always
          starts beneath it instead of under it. `onHero` gives the row the
          backdrop of a HeroShell / themed hero that follows it. */}
      <div className={cn("flex justify-end px-4 pt-3 lg:px-8", onHero ? "-mb-px bg-ignite-bg pb-px dark:bg-ignite-navy" : "bg-transparent")}>
        <ThemeToggle />
      </div>
    </>
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
      <label className="font-ui text-[13px] font-semibold text-ignite-ink-soft">
        {label}
      </label>
      {children}
      {trailing}
      {error ? (
        <span className="font-ui text-[13px] font-medium leading-[1.45] text-ignite-danger">{error}</span>
      ) : hint ? (
        <span className="font-ui text-[13px] leading-[1.45] text-ignite-muted">{hint}</span>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-xl border border-ignite-edge/[0.12] bg-ignite-surface px-[15px] py-[13px] font-ui text-[16px] text-ignite-ink outline-none transition-colors placeholder:text-ignite-faint focus:border-ignite-magenta focus:ring-[3px] focus:ring-ignite-magenta/20";

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
        className={cn(fieldBase, "resize-y leading-[1.6]", className)}
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
  return <div className={cn("animate-pulse rounded-md bg-ignite-lavender", className)} />;
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
        "flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-[15px] font-ui text-[16px] font-bold transition-colors",
        disabled
          ? "cursor-not-allowed bg-ignite-edge/[0.08] text-ignite-faint"
          : "bg-ignite-primary text-ignite-on-primary shadow-[0_8px_20px_rgba(44,29,68,0.18)] hover:bg-ignite-primary-hover",
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
      className="rounded-full border border-ignite-ink/70 bg-ignite-surface/60 px-5 py-2.5 font-ui text-[14px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-surface disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function WizardHeader({ onBack, canGoBack }: { onBack: () => void; canGoBack: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 pt-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        disabled={!canGoBack}
        className={cn(
          "flex h-[34px] w-[34px] items-center justify-center rounded-full border border-ignite-edge/[0.08] bg-ignite-surface text-[15px] text-ignite-ink transition-colors",
          canGoBack ? "hover:border-ignite-ink" : "cursor-not-allowed opacity-40",
        )}
      >
        ←
      </button>
      <span className="font-display text-[16px] font-bold text-ignite-ink">Team Registration</span>
      <div className="w-[34px]" />
    </div>
  );
}

export function DesktopSidebar({
  steps,
  step,
  onHome,
  onStepClick,
}: {
  steps: readonly { key: string; nav: string }[];
  step: number;
  onHome: () => void;
  /** Jump to a step already reached (done or current) — not to one still upcoming, since it may depend on fields not filled yet. */
  onStepClick?: (index: number) => void;
}) {
  return (
    <div className="sticky top-28 hidden w-[300px] flex-none flex-col gap-10 lg:flex">
      <button type="button" onClick={onHome} className="w-fit text-left" aria-label="Back to home">
        <BrandLogo className="h-20" />
      </button>

      <div className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "upcoming";
          const clickable = state !== "upcoming" && Boolean(onStepClick);
          return (
            <button
              key={s.key}
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(i)}
              className={cn(
                "flex items-center gap-3 rounded-lg py-2 text-left",
                clickable ? "cursor-pointer hover:bg-ignite-surface/80" : "cursor-default",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 flex-none items-center justify-center rounded-full font-ui text-[12px] font-bold",
                  state === "done" && "bg-brand-gradient text-white",
                  state === "current" && "border-2 border-ignite-ink text-ignite-ink",
                  state === "upcoming" && "border border-ignite-edge/[0.15] text-ignite-faint",
                )}
              >
                {state === "done" ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "font-ui text-[15px]",
                  state === "current" ? "font-bold text-ignite-ink" : "font-medium text-ignite-muted",
                )}
              >
                {s.nav}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-[5px]">
      {Array.from({ length: total }, (_, i) => i).map((i) => (
        <div
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i <= step ? "bg-brand-gradient" : "bg-ignite-edge/[0.08]",
          )}
        />
      ))}
    </div>
  );
}

export function StepMeta({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-ui text-[12px] font-medium text-ignite-muted">{hint}</span>
    </div>
  );
}

export function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h2 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-ignite-ink lg:text-[32px]">
        {title}
      </h2>
      <p className="m-0 font-ui text-[16px] leading-[1.55] text-ignite-muted">{subtitle}</p>
    </div>
  );
}

export function FormCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[18px] rounded-[20px] border border-ignite-edge/[0.06] bg-ignite-surface p-[22px] shadow-[0_1px_6px_rgba(0,0,0,0.06)] lg:p-8">
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-ignite-edge/[0.07]" />;
}

/** Gadgeon-style section eyebrow: small label with a short gradient line before it. */
export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-ui text-[12px] font-bold uppercase tracking-[0.14em]",
        onDark ? "text-white" : "text-ignite-ink",
      )}
    >
      <span aria-hidden="true" className="h-[2px] w-5 rounded-full bg-brand-gradient" />
      {children}
    </span>
  );
}

/** A word or phrase in the brand gradient, for key words in headlines. */
export function GradientText({ children }: { children: ReactNode }) {
  return <span className="text-brand-gradient">{children}</span>;
}

/**
 * Hero layout matching the g-IGNITE page on Gadgeon.ai: a backdrop with
 * blue/magenta glows (navy in the dark theme, light in the light theme), a small status label, a large headline, and the
 * page's actual content in a card beside it (below it on mobile), with the
 * large gIGNITE logo above the headline.
 * Render LogoHeaderBar above it, as the other public pages do.
 */
export function HeroShell({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="hero-themed relative flex min-h-[calc(100vh-136px)] items-center px-4 py-12 font-ui text-ignite-ink lg:px-16 lg:py-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="flex max-w-[560px] flex-col gap-5">
          {/* Big event logo above the headline, on a white plate so its blue
              lettering stays readable on the dark theme's navy. */}
          <div className="mx-auto mb-3 w-fit rounded-[20px] bg-white px-5 py-3 shadow-[0_16px_40px_rgba(44,29,68,0.12)] ring-1 ring-ignite-edge/[0.06] dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)] lg:mx-0">
            <BrandLogo className="h-20 sm:h-24 lg:h-32" />
          </div>
          <span className="inline-flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ignite-ink">
            <span aria-hidden="true" className="h-2 w-2 bg-ignite-orange" />
            {label}
          </span>
          <h1 className="m-0 font-display text-[40px] font-medium leading-[1.08] tracking-[-0.03em] text-ignite-ink lg:text-[60px]">
            {title}
          </h1>
          {intro && <div className="flex flex-col gap-3 text-[16px] leading-[1.7] text-ignite-ink-soft">{intro}</div>}
        </div>
        <div className="w-full max-w-[420px] self-center rounded-[24px] bg-ignite-surface p-7 text-ignite-ink-soft shadow-[0_24px_60px_rgba(44,29,68,0.12)] ring-1 ring-ignite-edge/10 dark:shadow-[0_24px_60px_rgba(0,0,0,0.35)] lg:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
