"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, UserCog, Download, LogOut, ScrollText } from "lucide-react";
import { BrandLogo, GridBackground, LogoHeaderBar, Spinner } from "@/components/admin/ui";
import { signOut } from "@/app/actions/auth";
import { exportRegistrationsCsv } from "@/app/actions/admin";
import { downloadCsv } from "@/lib/csv-download";
import { roleLabel, isAdminLevelRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Sidebar app shell — per the Claude Design file's "gIGNITE Team Detail
 * Page" mockup (which includes the full nav shell, not just the page
 * content). Replaces the old top-header nav across the whole admin area.
 *
 * The design's "Dashboard" and "Teams" are two separate nav items, but this
 * app only has one team-list route — so there's a single "Teams" item
 * instead of two links to the same place. Likewise "Settings" became
 * "Staff" (admin-only), since that's the closest real destination this app
 * has; a dead "Settings" link felt worse than renaming it.
 */
export function DashboardShell({
  role,
  name,
  children,
}: {
  role: string;
  name: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [exporting, setExporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // No reset afterwards: the login page replaces this one once it's done.
  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportRegistrationsCsv();
    setExporting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    downloadCsv(result.csv, result.filename);
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const navItemClass = (active: boolean) =>
    cn(
      "relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-ui text-[14px] transition-colors",
      active
        ? "bg-white/[0.10] font-bold text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-gradient"
        : "font-medium text-ignite-on-dark hover:bg-white/[0.06] hover:text-white",
    );

  return (
    <div className="relative flex min-h-screen bg-ignite-bg font-ui text-ignite-ink-soft">
      <GridBackground faded />

      {/* Sidebar — desktop only; mobile gets a compact top bar instead. */}
      <aside className="hero-dark sticky top-0 z-10 hidden h-screen w-[236px] flex-none flex-col justify-between overflow-y-auto border-r border-white/[0.06] px-3.5 py-5 lg:flex">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5 px-2.5">
            <div className="h-3 w-3 flex-none rounded-[3px] bg-brand-gradient" />
            <span className="font-display text-[18px] font-bold tracking-[-0.01em] text-white">gIGNITE</span>
            <span className="pt-0.5 font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-on-dark/70">
              {roleLabel(role)}
            </span>
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/dashboard" className={navItemClass(pathname === "/dashboard" || pathname.startsWith("/dashboard/teams"))}>
              <Users className="h-[17px] w-[17px]" />
              <span>Teams</span>
            </Link>
            {role === "super_admin" && (
              <Link href="/dashboard/staff" className={navItemClass(pathname === "/dashboard/staff")}>
                <UserCog className="h-[17px] w-[17px]" />
                <span>Staff</span>
              </Link>
            )}
            {role === "super_admin" && (
              <Link href="/dashboard/audit-logs" className={navItemClass(pathname === "/dashboard/audit-logs")}>
                <ScrollText className="h-[17px] w-[17px]" />
                <span>Audit logs</span>
              </Link>
            )}
            {isAdminLevelRole(role) && (
              <button type="button" onClick={handleExport} disabled={exporting} className={navItemClass(false)}>
                <Download className="h-[17px] w-[17px]" />
                <span>{exporting ? "Exporting…" : "Export"}</span>
              </button>
            )}
          </nav>
        </div>
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(navItemClass(false), "disabled:cursor-not-allowed disabled:opacity-70")}
          >
            {signingOut ? <Spinner className="h-[17px] w-[17px]" /> : <LogOut className="h-[17px] w-[17px]" />}
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/[0.06]">
            <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-brand-gradient font-display text-[12px] font-bold text-white">
              {initials || "?"}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold text-white">{name}</span>
              <span className="font-ui text-[11px] uppercase tracking-[0.08em] text-ignite-on-dark/70">{roleLabel(role)}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Content column: logo bar + compact top bar (mobile/tablet only) + main, stacked. Sidebar stays untouched to the left. */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <LogoHeaderBar />
        <header className="flex items-center justify-between border-b border-ignite-edge/[0.08] bg-ignite-surface px-5 py-3.5 lg:hidden">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-7" />
            <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-muted">{roleLabel(role)}</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 font-ui text-[13px] font-semibold text-ignite-ink hover:text-ignite-magenta disabled:cursor-not-allowed disabled:opacity-70"
          >
            {signingOut && <Spinner className="h-3 w-3" />}
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>

        <main className="min-h-screen flex-1 overflow-x-hidden p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
