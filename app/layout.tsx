import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

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
    <html lang="en">
      <body className="font-body antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
