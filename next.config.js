const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === '1',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Optimized for performance and reduced memory usage */

  // Set aggressive keep-alive timeout to prevent CLOSE-WAIT connection buildup.
  // Eric's Android browser kills WebSocket/HTTP connections on every tab switch.
  // Without this, the server holds dead sockets indefinitely.
  httpAgentOptions: {
    keepAlive: true,
  },
  // Prevent server-only packages from being bundled by webpack.
  // These packages (and their transitive deps) use Node.js core modules
  // (stream, net, fs, etc.) that webpack can't resolve in the instrumentation
  // bundle context.
  serverExternalPackages: [
    'firebase-admin',
    '@google-cloud/firestore',
    '@google-cloud/storage',
  ],
  typescript: {
    tsconfigPath: './tsconfig.json',
    ignoreBuildErrors: true,
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
  webpack: (config, { isServer, dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /COPILOT_SESSION_STATE|\.session-backups|AUTONOMOUS_STATUS/,
      };
    }

    // Externalize server-only packages in ALL server compilations
    // (including the instrumentation bundle, where serverExternalPackages
    // alone doesn't reach). Without this, webpack tries to resolve
    // transitive deps that use Node.js built-ins (stream, fs, net, http)
    // which aren't available in every bundle context.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        /^firebase-admin/,
        /^@google-cloud\//,
        /^@grpc\//,
        /^@opentelemetry\//,
        /^genkit/,
        /^@genkit-ai\//,
        // Treat Node.js built-in imports as external commonjs modules.
        // The instrumentation bundle doesn't have webpack's node: scheme
        // plugin, so both bare ('child_process') and prefixed ('node:fs')
        // specifiers fail. This handler catches both forms.
        ({ request }, callback) => {
          if (!request) return callback();
          // Handle node: protocol imports (e.g. 'node:crypto', 'node:fs/promises')
          if (request.startsWith('node:')) {
            return callback(null, `commonjs ${request}`);
          }
          // Handle bare Node.js built-in specifiers (e.g. 'child_process', 'fs')
          const builtins =
            /^(child_process|fs|path|os|http|https|net|stream|events|buffer|url|tls|dns|zlib|util|crypto|assert|cluster|dgram|readline|repl|string_decoder|tty|v8|vm|worker_threads|perf_hooks|async_hooks|inspector|querystring|timers|constants|module|process|console|punycode|domain|sys)(\/.*)?$/;
          if (builtins.test(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        }
      );
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
