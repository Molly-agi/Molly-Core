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
  // Prevent firebase-admin from being bundled for client/edge.
  // It uses Node.js core modules (stream, net, etc.) that don't exist there.
  // Also exclude dependencies that use WebAssembly or Node-specific modules.
  serverExternalPackages: [
    // Firebase ecosystem
    'firebase-admin',
    '@google-cloud/firestore',
    'farmhash-modern',
    // gRPC ecosystem
    '@grpc/grpc-js',
    '@grpc/proto-loader',
    // OpenTelemetry ecosystem (all of it)
    '@opentelemetry/sdk-node',
    '@opentelemetry/otlp-grpc-exporter-base',
    '@opentelemetry/exporter-trace-otlp-grpc',
    '@opentelemetry/exporter-jaeger',
    '@opentelemetry/instrumentation',
    '@opentelemetry/core',
    '@opentelemetry/api',
    // Genkit ecosystem
    '@genkit-ai/core',
    '@genkit-ai/ai',
    'genkit',
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

    // Mark Node.js built-in modules as external for non-server builds
    // This prevents "Module not found: Can't resolve 'fs'" errors when
    // instrumentation.ts imports server-only modules that use fs/path/crypto
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        child_process: false,
        util: false,
        net: false,
        tls: false,
        stream: false,
        os: false,
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
