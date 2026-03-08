import "./globals.css";

export const metadata = {
  title: "小卡管家",
  description: "專屬你的 K-Pop 追星小卡管理工具",
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