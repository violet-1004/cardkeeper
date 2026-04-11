/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@cloudflare/next-on-pages']
  }
};

export default nextConfig;