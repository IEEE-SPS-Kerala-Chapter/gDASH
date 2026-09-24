/**
 * Admin/judge/staff UI primitives — the same design language as the
 * participant pages (components/registration/ui.tsx, matched to the
 * Gadgeon.ai site; see gadgeon-design-reference.md). Re-exports the
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
  Eyebrow,
  GradientText,
  HeroShell,
} from "@/components/registration/ui";
export { ThemeToggle } from "@/components/theme/theme-toggle";

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-ignite-ink">{title}</h1>
      {subtitle && <p className="m-0 font-ui text-[15px] leading-[1.55] text-ignite-muted">{subtitle}</p>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink-soft">{children}</span>
  );
}

const BADGE_VARIANTS = {
  neutral: "bg-ignite-lavender text-ignite-ink",
  warn: "bg-ignite-warn-pale text-ignite-warn",
  success: "bg-ignite-success-pale text-ignite-success",
  danger: "bg-ignite-danger-pale text-ignite-danger",
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
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 font-ui text-[10px] font-bold uppercase tracking-[0.1em]",
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
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 font-ui text-[15px] font-bold"
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
        "rounded-[20px] border border-ignite-edge/[0.07] bg-ignite-surface shadow-[0_1px_6px_rgba(0,0,0,0.06)]",
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
    <div className="flex items-center gap-0.5 rounded-full border border-ignite-edge/[0.12] bg-ignite-surface p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-[7px] font-ui text-[13px] font-semibold transition-colors",
            value === opt.value ? "bg-ignite-primary text-ignite-on-primary" : "text-ignite-muted hover:text-ignite-ink",
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
        checked ? "bg-ignite-success" : "bg-ignite-edge/[0.18]",
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
        tone === "danger" ? "text-ignite-ink/70 hover:text-ignite-danger" : "text-ignite-muted hover:text-ignite-ink",
      )}
    >
      {children}
    </button>
  );
}
