/**
 * Admin/judge/staff UI primitives — deliberately built from the SAME design
 * language as components/registration/ui.tsx (the Claude Design file this
 * project follows), not shadcn/ui restyled with brand colors. Re-exports the
 * pieces that carry over as-is, and adds only what the admin side needs that
 * the registration wizard never did: status badges, a list/card view
 * toggle, and a denser panel for data-heavy screens.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export {
  BrandLogo,
  GridBackground,
  LogoHeaderBar,
  Field,
  TextInput,
  TextArea,
  Select,
  PrimaryButton,
  SecondaryButton,
  FormCard,
  Divider,
  Spinner,
  Skeleton,
} from "@/components/registration/ui";

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h1 className="m-0 font-heading text-[26px] font-bold tracking-[-0.025em] text-black">{title}</h1>
      {subtitle && <p className="m-0 text-[15px] leading-[1.55] text-gignite-text">{subtitle}</p>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-text/70">{children}</span>
  );
}

const BADGE_VARIANTS = {
  neutral: "bg-gignite-blue-pale text-gignite-blue",
  warn: "bg-gignite-warn-pale text-gignite-warn",
  success: "bg-gignite-success-pale text-gignite-success",
  danger: "bg-gignite-danger-pale text-gignite-danger",
} as const;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

export function Badge({
  variant = "neutral",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Denser cousin of FormCard, for list rows / compact panels rather than form sections. */
/**
 * Bigger dot-badge for the team detail header's status — takes exact
 * colors rather than a fixed variant set, since the design gives each
 * registration status its own {bg, fg, dot} rather than reusing the
 * compact Badge's success/warn/danger tones (see lib/registration-status.ts).
 */
export function StatusDotBadge({
  label,
  bg,
  fg,
  dot,
}: {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

export function Panel({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.08] bg-gignite-surface shadow-[0_2px_4px_rgba(44,44,44,0.05),0_16px_34px_rgba(32,65,154,0.09)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-[10px] border-[1.5px] border-gignite-border bg-gignite-surface p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-[7px] px-3 py-[7px] font-body text-[13px] font-semibold transition-colors",
            value === opt.value ? "bg-gignite-blue-pale text-gignite-blue" : "text-gignite-muted hover:text-gignite-text",
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact on/off switch for a single boolean setting (e.g. registration
 * open/closed) — SegmentedToggle reads better for 2-4 named options picked
 * from a filter bar, but stretches into an oversized strip for a plain
 * yes/no, most of it empty space. Pair with a Badge to also label the
 * current state in words, not just position.
 */
export function Switch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors",
        checked ? "bg-gignite-success" : "bg-gignite-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] flex-none translate-x-[3px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform",
          checked && "translate-x-[20px]",
        )}
      />
    </button>
  );
}

/** Small pill button, for row-level actions like "Remove" or a chip's "×". */
export function ChipButton({
  children,
  onClick,
  ariaLabel,
  tone = "muted",
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  tone?: "muted" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "leading-none transition-colors",
        tone === "danger" ? "text-gignite-blue/70 hover:text-gignite-danger" : "text-gignite-muted hover:text-gignite-text",
      )}
    >
      {children}
    </button>
  );
}
