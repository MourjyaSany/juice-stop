import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Workspace packages ship TypeScript-free CJS builds, but transpiling them here keeps source
  // maps useful and lets Next tree-shake across the boundary.
  transpilePackages: ['@juice-stop/core'],

  experimental: {
    optimizePackageImports: ['@juice-stop/core'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

export default config;
