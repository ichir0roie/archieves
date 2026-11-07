import { useEffect, useState } from "react";

/**
 * 画面に載ってから URL のクエリを読む。読むまでは null。
 * useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、こちらを使う
 */
export function useQueryParams(): URLSearchParams | null {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);
  return params;
}
