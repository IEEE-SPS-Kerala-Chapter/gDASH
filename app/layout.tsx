import type { Metadata } from "next";
import { Sora, Urbanist } from "next/font/google";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { ThemedToaster } from "@/components/theme/themed-toaster";
import "./globals.css";

// Self-hosted (same-origin) so the participant pages load them fast and the
// ID-card PNG export can embed them. Exposed as CSS variables only; the
// admin side keeps its own fonts from globals.css.
const sora = Sora({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sora" });
const urbanist = Urbanist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-urbanist" });

export const metadata: Metadata = {
  title: "gIGNITE — Hackathon Registration",
  description: "Team registration, idea submission, and event logistics for gIGNITE.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${sora.variable} ${urbanist.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a stored light-theme choice before first paint (dark is the default). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-ignite-bg font-ui text-ignite-ink antialiased">
        <ThemeProvider>
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
