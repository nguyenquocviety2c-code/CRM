import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Pin the Turbopack workspace root to THIS project so module resolution
  // never accidentally climbs to the parent /home/z/my-project lockfile.
  turbopack: {
    root: __dirname,
  },
  // Allow the sandbox Preview Panel (and any preview-* subdomain) to access
  // Next.js dev-only resources (fonts, HMR, Fast Refresh). Without this,
  // Next.js blocks cross-origin requests from the preview host, which breaks
  // HMR and causes the Preview Panel to freeze/stop rendering after a while.
  // NOTE: Next.js 16 only accepts strings here (not RegExp objects).
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "preview-chat-93d75e59-6a6c-41a9-a31c-2eb20f997079.space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;
