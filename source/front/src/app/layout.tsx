import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@aws-amplify/ui-react/styles.css";
import "./globals.css";
import ApiErrorRedirect from "@/components/ApiErrorRedirect";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { T } from "@/lib/text/server";

export const metadata: Metadata = {
  title: T.appTitle,
  description: T.appDescription,
  applicationName: T.appName,
  keywords: T.appKeywords,
  openGraph: {
    type: "website",
    siteName: T.appName,
    title: T.appTitle,
    description: T.appDescription,
    locale: "ja_JP",
  },
  twitter: {
    card: "summary",
    title: T.appTitle,
    description: T.appDescription,
  },
  // iOS の「ホーム画面に追加」で付く名前と、全画面で開く指定(マニフェストを読まない iOS 向け)
  appleWebApp: {
    capable: true,
    title: T.appName,
    statusBarStyle: "default",
  },
  // 点数の並びが電話番号に見えてリンクにされないようにする
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // globals.css の --bg に揃える
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#15171b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AuthGate>
          <ApiErrorRedirect />
          <Nav />
          {/* useSearchParams を読む画面(score-view)があるので、Suspense で包む */}
          <main>
            <Suspense>{children}</Suspense>
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
