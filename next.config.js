/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Optimized for performance and reduced memory usage */
  typescript: {
    tsconfigPath: './tsconfig.json',
    // Remove double compilation passes
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // SWC is the default compiler in Next.js 15+, removes console logs in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
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

module.exports = nextConfig;
