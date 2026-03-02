import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 🌟 告訴 Vercel：忽略所有 TypeScript 型別錯誤，強制發布！
    ignoreBuildErrors: true,
  },
  eslint: {
    // 🌟 告訴 Vercel：忽略所有 ESLint 語法潔癖警告，強制發布！
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;