import type { Metadata } from "next";
import { Sora, Urbanist } from "next/font/google";
import { Toaster } from "sonner";
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
    <html lang="en" className={`${sora.variable} ${urbanist.variable}`}>
      <body className="font-body antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
