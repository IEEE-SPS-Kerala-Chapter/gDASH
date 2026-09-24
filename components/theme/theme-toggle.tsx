"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

/** Small square sun/moon button that flips between the light and dark theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn(
        "flex h-9 w-9 flex-none items-center justify-center rounded-[8px] border border-ignite-edge/[0.2] bg-ignite-surface/80 text-ignite-ink backdrop-blur transition-colors hover:border-ignite-ink/60",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
    </button>
  );
}
