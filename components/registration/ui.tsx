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
 * Continuously scrolling sponsor strip — the Gadgeon logo (from the
 * gIGNITE-UI landing page's public/ folder) repeated in a seamless loop.
 * Two identical copies of the same run sit side by side; animating the
 * outer track exactly -50% of its own width loops without a visible seam.
 * Sits in normal document flow (not fixed/overlaid), so it never covers
 * page content — just pushes it down like a banner.
 */
export function MarqueeStrip({ className }: { className?: string }) {
  const run = (copyIndex: number) => (
    <div className="flex flex-none items-center gap-20 pr-20" aria-hidden={copyIndex === 1}>
      {Array.from({ length: 6 }, (_, i) => (
        <Image
          key={i}
          src="/gadgeon-logo.png"
          alt={copyIndex === 0 && i === 0 ? "Gadgeon Smart Systems" : ""}
          width={190}
          height={64}
          className="h-14 w-auto flex-none opacity-80"
        />
      ))}
    </div>
  );

  return (
    <div
      className={cn(
        "relative z-10 flex w-full items-center overflow-hidden border-b border-gignite-border bg-gignite-card py-4",
        className,
      )}
    >
      <div className="flex w-max animate-marquee">
        {run(0)}
        {run(1)}
      </div>
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
  hint?: string;
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

export function PrimaryButton({
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        "w-full rounded-[11px] px-6 py-4 font-heading text-[17px] font-bold transition-colors",
        disabled
          ? "cursor-not-allowed bg-gignite-border text-gignite-muted shadow-none"
          : "bg-gignite-accent text-black shadow-[0_3px_0_rgba(150,67,11,0.45)] hover:bg-gignite-accent-hover",
      )}
    >
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

export function WizardHeader({ onBack, canGoBack }: { onBack: () => void; canGoBack: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 pt-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        disabled={!canGoBack}
        className={cn(
          "flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] border-gignite-border text-[15px] text-gignite-blue transition-colors",
          canGoBack ? "hover:border-gignite-blue" : "cursor-not-allowed opacity-40",
        )}
      >
        ←
      </button>
      <span className="font-heading text-[16px] font-bold text-black">Team Registration</span>
      <div className="w-[34px]" />
    </div>
  );
}

export function DesktopSidebar({
  steps,
  step,
  onHome,
}: {
  steps: readonly { key: string; nav: string }[];
  step: number;
  onHome: () => void;
}) {
  return (
    <div className="sticky top-10 hidden w-[300px] flex-none flex-col gap-10 lg:flex">
      <button type="button" onClick={onHome} className="w-fit text-left" aria-label="Back to home">
        <BrandLogo className="h-20" />
      </button>

      <div className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "upcoming";
          return (
            <div key={s.key} className="flex items-center gap-3 py-2">
              <div
                className={cn(
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] font-medium",
                  state === "done" && "bg-gignite-accent text-black",
                  state === "current" && "border-[1.5px] border-gignite-blue text-gignite-blue",
                  state === "upcoming" && "border-[1.5px] border-gignite-border text-gignite-muted",
                )}
              >
                {state === "done" ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "font-body text-[14px]",
                  state === "current" ? "font-semibold text-black" : "text-gignite-text/70",
                )}
              >
                {s.nav}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-[5px]">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i <= step ? "bg-gignite-accent" : "bg-gignite-divider",
          )}
        />
      ))}
    </div>
  );
}

export function StepMeta({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
        {label}
      </span>
      <span className="font-mono text-[11px] text-gignite-text/65">{hint}</span>
    </div>
  );
}

export function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h2 className="m-0 font-heading text-[28px] font-bold tracking-[-0.025em] text-black">
        {title}
      </h2>
      <p className="m-0 text-[15px] leading-[1.55] text-gignite-text">{subtitle}</p>
    </div>
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
