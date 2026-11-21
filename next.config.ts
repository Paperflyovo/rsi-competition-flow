import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['cheerio'],
  async redirects() {
    return [{ source: '/flow-editor/index.html', destination: '/flow-editor', permanent: false }];
  },
};

export default nextConfig;
