/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev', // 🌟 請換成您的 R2 公開網域
        port: '',
        pathname: '/**', // 允許該網域下的所有圖片路徑
      },
      // 如果您還有保留一些 Supabase 的圖片，可以把 Supabase 也留著
      {
        protocol: 'https',
        hostname: 'qvmypjngydubsigeeial.supabase.co',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

module.exports = nextConfig; 
// 如果您的檔案是 .mjs，最後一行應該是 export default nextConfig;