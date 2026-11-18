import type { NextConfig } from 'next';

// The browser only talks to this Next.js server. /api/* is forwarded to groundwork-api by
// app/api/[...path]/route.ts, which reads API_URL at runtime (same origin, so the login cookie just works).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
