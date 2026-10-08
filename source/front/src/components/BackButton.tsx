"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/text";

/** 画面の最下部に置く、前の画面に戻るボタン。 */
export default function BackButton() {
  const T = useT();
  const router = useRouter();

  function goBack() {
    // URL を直に開いた・新しいタブで開いたときは戻る先が無いので、ホームへ行く
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <button
      type="button"
      className="block back-button"
      onClick={goBack}
    >
      {T.back}
    </button>
  );
}
