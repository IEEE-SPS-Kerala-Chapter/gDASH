"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, UserCog, Download, LogOut } from "lucide-react";
import { BrandLogo, GridBackground, MarqueeStrip } from "@/components/admin/ui";
import { signOut } from "@/app/actions/auth";
import { exportRegistrationsCsv } from "@/app/actions/admin";
import { downloadCsv } from "@/lib/csv-download";
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

  async function handleSignOut() {
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
      "flex items-center gap-2.5 rounded-[9px] border-l-[3px] px-3 py-2.5 text-[14px] transition-colors",
      active
        ? "border-gignite-accent bg-white/[0.13] font-semibold text-white"
        : "border-transparent text-[#C3CEE9] hover:bg-white/[0.08]",
    );

  return (
    <div className="relative flex min-h-screen bg-gignite-bg font-body text-gignite-text">
      <GridBackground faded />

      {/* Sidebar — desktop only; mobile gets a compact top bar instead. */}
      <aside className="sticky top-0 z-10 hidden h-screen w-[228px] flex-none flex-col justify-between overflow-y-auto bg-gignite-blue px-3.5 py-5 lg:flex">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5 px-2.5">
            <div className="h-3 w-3 flex-none rounded-[3px] bg-gignite-accent" />
            <span className="font-heading text-[18px] font-bold tracking-[-0.01em] text-white">gIGNITE</span>
            <span className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9FB1DA]">
              {role}
            </span>
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/dashboard" className={navItemClass(pathname === "/dashboard" || pathname.startsWith("/dashboard/teams"))}>
              <Users className="h-[17px] w-[17px]" />
              <span>Teams</span>
            </Link>
            {role === "admin" && (
              <Link href="/dashboard/staff" className={navItemClass(pathname === "/dashboard/staff")}>
                <UserCog className="h-[17px] w-[17px]" />
                <span>Staff</span>
              </Link>
            )}
            <button type="button" onClick={handleExport} disabled={exporting} className={navItemClass(false)}>
              <Download className="h-[17px] w-[17px]" />
              <span>{exporting ? "Exporting…" : "Export"}</span>
            </button>
          </nav>
        </div>
        <div className="flex flex-col gap-3.5">
          <button type="button" onClick={handleSignOut} className={navItemClass(false)}>
            <LogOut className="h-[17px] w-[17px]" />
            <span>Sign out</span>
          </button>
          <div className="flex items-center gap-2.5 rounded-[9px] bg-black/[0.16] p-3">
            <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-gignite-accent font-heading text-[12px] font-bold text-black">
              {initials || "?"}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold text-white">{name}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#9FB1DA]">{role}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Content column: marquee + compact top bar (mobile/tablet only) + main, stacked. Sidebar stays untouched to the left. */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <MarqueeStrip />
        <header className="flex items-center justify-between border-b border-gignite-border bg-gignite-card px-5 py-3.5 lg:hidden">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-7" />
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-text/70">{role}</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="font-body text-[13px] font-semibold text-gignite-blue hover:text-gignite-accent"
          >
            Sign out
          </button>
        </header>

        <main className="min-h-screen flex-1 overflow-x-hidden p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
