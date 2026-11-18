import type { NextConfig } from 'next';

// The browser only talks to this Next.js server. /api/* is forwarded to groundwork-api by
// app/api/[...path]/route.ts, which reads API_URL at runtime (same origin, so the login cookie just works).
const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a second build (e.g. a test copy) live beside the dev server's .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
