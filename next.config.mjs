/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🌟 已移除所有會導致 Edge 崩潰的 Webpack 覆寫
  // Next.js 14 在 Cloudflare (配合 nodejs_compat) 下能完美原生執行
};

export default nextConfig;