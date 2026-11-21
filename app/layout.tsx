import type { Metadata } from "next";
import "./globals.css";
import { ReduxProvider } from "../src/store/Provider";

export const metadata: Metadata = {
  title: "RSI Flow · 实验室参赛调研台",
  description: "在可视化流程中调研赛事与主办方公告。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}

