import "./globals.css";

export const metadata = {
  title: "小卡管家",
  description: "專屬你的 K-Pop 追星小卡管理工具",
};

// 🌟 viewportFit: 'cover' 讓內容延伸到瀏海/Home Indicator 下方，
// 搭配 env(safe-area-inset-*) 才能正確避開手機系統區域
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#9B90C2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="antialiased no-scrollbar">
        <style>{`
          ::-webkit-scrollbar {
            display: none;
          }
          * {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}