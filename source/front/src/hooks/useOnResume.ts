import { useEffect, useRef } from "react";

/**
 * 画面に戻ってきたとき(別のアプリ・タブから戻る、閉じた画面をブラウザが bfcache から戻す)に呼ぶ。
 * スマホは裏に回すと通信が止まるので、裏に回る前の読み込みが失敗・途中のまま残ったり、
 * 古い内容のまま戻ったりする。それを読み直すために使う。
 */
export function useOnResume(onResume: () => void) {
  const callback = useRef(onResume);
  callback.current = onResume;

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") callback.current();
    }
    // bfcache から戻した画面では visibilitychange が来ないことがあるので、pageshow も見る
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) callback.current();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
