/** @type {import('next').NextConfig} */
const nextConfig = {
  // The emailed ID cards (lib/email/id-card-image.tsx) and the team report
  // PDFs (lib/team-report.ts) are drawn on the server from these files,
  // which serverless functions don't get by default.
  outputFileTracingIncludes: {
    "/**": [
      "./lib/email/fonts/*.ttf",
      "./public/gignite-logo.png",
      "./public/gadgeon-logo.png",
      "./public/ieee_sps_kc_logo.png",
      "./public/fisat-sb-logo.png",
    ],
  },
};

export default nextConfig;
