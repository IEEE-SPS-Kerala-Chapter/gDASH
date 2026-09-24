"use client";

import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

/** sonner's Toaster, following the page's light/dark theme. */
export function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster richColors position="top-center" theme={theme} />;
}
