import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local dev only: keep build output OUT of the iCloud-synced repo folder,
  // where the file watcher misses changes and sync can corrupt .next.
  // Vercel (production build) must use the default .next dir.
  ...(process.env.NODE_ENV === 'development' ? { distDir: '/tmp/tui-media-crm-next' } : {}),
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
