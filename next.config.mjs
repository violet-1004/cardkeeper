/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co', // 允許所有 Supabase 網域的圖片進行壓縮
      },
    ],
  },
};

export default nextConfig;