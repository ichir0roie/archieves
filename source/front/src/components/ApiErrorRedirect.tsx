"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { API_ERROR_REDIRECT_EVENT } from "@/lib/api";
import { isPublicPath } from "@/lib/scoreShare";

/**
 * API のエラー(client.ts の handleApiError)を受けてホームへ移る。描くものは無い。
 * ホームで起きたエラーは移っても同じ画面なので、何もしない。公開の画面は、ログインしていない人をホーム
 * (ログインの画面)へ送らないよう、画面に残してエラーを出す
 */
export default function ApiErrorRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function goHome() {
      if (pathname !== "/" && !isPublicPath(pathname)) router.replace("/");
    }
    window.addEventListener(API_ERROR_REDIRECT_EVENT, goHome);
    return () => window.removeEventListener(API_ERROR_REDIRECT_EVENT, goHome);
  }, [pathname, router]);

  return null;
}
