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

  /**
   * Proxy the API under the web app's own origin.
   *
   * The browser bundle previously called `http://localhost:3000` directly, which is only correct
   * when the browser *is* the machine running the API. Open the site from a phone — or from any
   * tunnel or deployment — and "localhost" means the phone, so every request fails.
   *
   * Routing through the web origin fixes that for good: the client uses a relative path, so it
   * works identically on a laptop, a phone on the LAN, a tunnel and a real deployment, with no
   * rebuild and no per-environment URL. It also removes the CORS preflight entirely, since the
   * request is now same-origin.
   *
   * `API_ORIGIN` stays configurable for the case where the API genuinely lives elsewhere.
   */
  async rewrites() {
    const target = process.env['API_ORIGIN'] ?? 'http://127.0.0.1:3000';
    return [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }];
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
