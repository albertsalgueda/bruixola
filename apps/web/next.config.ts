import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
      // pisos.com gallery CDN (used by the scraper pipeline).
      {
        protocol: 'https',
        hostname: 'fotos.imghs.net',
        pathname: '/**',
      },
    ],
  },
  typedRoutes: true,
  transpilePackages: ['mapbox-gl'],
};

export default nextConfig;
