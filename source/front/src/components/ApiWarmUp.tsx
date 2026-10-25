"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { warmUpApi } from "@/lib/api";
import { isPublicPath } from "@/lib/scoreShare";

// API の実行環境は 5 分ほど空くと落ちるので、それより十分短くする
const WARM_UP_INTERVAL_MS = 60_000;

/**
 * 画面が見えている間、1 分ごとに API と db の接続を温める(API の endpoints/warm_up.py)。描くものは無い。
 * 点数の入力は保存まで API を叩かないので、温めないと保存が冷えた API に当たって数秒かかる。
 * 裏に回すと止め、見えるようになったら(スマホの画面を点けた、別のアプリから戻った)すぐ一度叩いてから続ける。
 * 開いた直後は、画面の読み込みが API を叩くので、1 分後から叩く。
 * ログインしていない人も開ける公開の画面では叩かない(route handler が 401 を返すだけになる)
 */
export default function ApiWarmUp() {
  const pathname = usePathname();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (isPublic) return;
    let timer: number | null = null;

    function stop() {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    }
    function start(now: boolean) {
      stop();
      if (now) void warmUpApi();
      timer = window.setInterval(() => void warmUpApi(), WARM_UP_INTERVAL_MS);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") start(true);
      else stop();
    }
    // bfcache から戻した画面では visibilitychange が来ないことがあるので、pageshow も見る(useOnResume と同じ)
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) start(true);
    }

    // 開いた直後は叩かない。画面の読み込みが API を叩くので、同時に送ると、Lambda の実行環境
    // (一つで一度に一つの要求しか受けない)がもう一つ冷えたまま起き、その起動と db の接続が無駄になる
    if (document.visibilityState === "visible") start(false);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [isPublic]);

  return null;
}
