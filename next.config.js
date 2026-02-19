const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === '1',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Optimized for performance and reduced memory usage */
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Prevent hot-reload restarts when session state files are written to project root.
  // Without this, writing COPILOT_SESSION_STATE.md/.json triggers Next.js file
  // watcher which does a clean server restart — looks like a silent crash.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /COPILOT_SESSION_STATE|\.session-backups|AUTONOMOUS_STATUS/,
      };
    }
    return config;
  },
  // Keep compiled pages in memory long enough for slow codespace compiles.
  // Default is 60s / 5 pages. On 8GB with ~35s cold compile, 15s was too
  // aggressive and caused the server to evict pages mid-compile.
  onDemandEntries: {
    maxInactiveAge: 60 * 1000, // 60s (Next.js default)
    pagesBufferLength: 5, // 5 pages (Next.js default)
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:9002',
        '127.0.0.1:9002',
        '*.app.github.dev',
        '*.app.github.dev:9002',
        'special-succotash-g4pw4gjg7wxhwwjg-9002.app.github.dev',
      ],
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
