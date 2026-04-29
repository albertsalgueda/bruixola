import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Listing photos come from dozens of agency CDNs (pisos.com, fotocasa,
    // idealista, individual broker sites). Allowlisting each one is
    // unmaintainable, and Next/Image can't decide ahead of time which
    // hostnames the scraper will surface. Wildcard hostname matched via
    // picomatch — see node_modules/next/dist/shared/lib/match-remote-pattern.js.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  typedRoutes: true,
  transpilePackages: ['mapbox-gl'],
};

export default nextConfig;
