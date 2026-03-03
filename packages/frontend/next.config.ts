import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo/workspace fix: ensure Next traces output from the actual repo root,
  // not a parent directory lockfile (can break production build on Windows).
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

