import { useCallback, useEffect, useRef } from "react";

/**
 * 点数の入力の画面で、スマホの誤操作で入力が中断されないようにする。
 * - 戻るボタン・戻るスワイプ: 履歴を一つ積んでおき、戻られたら積み直して画面にとどまる(離れるのは画面の ✕ だけ)
 * - 再読み込み・タブを閉じる: ブラウザの確認を出す。引っ張って更新は globals.css の overscroll-behavior で止める
 *
 * 返す関数は、画面から自ら離れる直前(終了の保存が済んだあと・✕)に呼ぶ。Next の遷移は
 * 全ページの読み込みに落ちることがあり、そこで確認が出て取り消されると、終了の覆いが残ったまま
 * 画面にとどまって操作できなくなるため。
 */
export function useGuardScoreEntry(): () => void {
  const released = useRef(false);

  useEffect(() => {
    // 戻る操作で画面が替わらないよう、同じ URL の履歴を足す
    window.history.pushState({ scoreEntryGuard: true }, "", window.location.href);

    const onPopState = () => {
      if (released.current) return;
      window.history.pushState({ scoreEntryGuard: true }, "", window.location.href);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (released.current) return;
      e.preventDefault();
      // 古いブラウザは returnValue が無いと確認を出さない
      e.returnValue = "";
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return useCallback(() => {
    released.current = true;
  }, []);
}
