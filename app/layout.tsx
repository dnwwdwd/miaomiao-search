import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lazycat Search",
  description: "Self-hosted multi-engine search and MCP management portal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script src="https://unpkg.com/@phosphor-icons/web" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
