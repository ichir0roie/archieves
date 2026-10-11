"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { API_ERROR_REDIRECT_EVENT } from "@/lib/api";

/**
 * API のエラー(client.ts の handleApiError)を受けてホームへ移る。描くものは無い。
 * ホームで起きたエラーは移っても同じ画面なので、何もしない
 */
export default function ApiErrorRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function goHome() {
      if (pathname !== "/") router.replace("/");
    }
    window.addEventListener(API_ERROR_REDIRECT_EVENT, goHome);
    return () => window.removeEventListener(API_ERROR_REDIRECT_EVENT, goHome);
  }, [pathname, router]);

  return null;
}
