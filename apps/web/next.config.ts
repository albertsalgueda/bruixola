import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['mapbox-gl'],
};

export default nextConfig;
