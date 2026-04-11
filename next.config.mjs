/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { nextRuntime }) => {
    // 🌟 核心防爆機制：告訴 Webpack 直接使用 Cloudflare 原生的 node:async_hooks
    if (nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        'async_hooks': 'node:async_hooks'
      };
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['@cloudflare/next-on-pages']
  }
};

export default nextConfig;