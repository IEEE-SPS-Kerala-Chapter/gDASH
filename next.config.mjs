/** @type {import('next').NextConfig} */
const nextConfig = {
  // The emailed ID cards are drawn on the server (lib/email/id-card-image.tsx)
  // from these files, which serverless functions don't get by default.
  outputFileTracingIncludes: {
    "/**": [
      "./lib/email/fonts/*.ttf",
      "./public/gignite-logo.png",
      "./public/gadgeon-logo.png",
      "./public/ieee_sps_kc_logo.png",
    ],
  },
};

export default nextConfig;
