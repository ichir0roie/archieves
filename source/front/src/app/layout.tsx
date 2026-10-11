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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
