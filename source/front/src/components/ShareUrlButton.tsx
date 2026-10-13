"use client";

import { useEffect, useState } from "react";
import { scoreShareUrl } from "@/lib/scoreShare";
import { useT } from "@/lib/text";

type Props = {
  gameIds: ReadonlyArray<number>;
};

// 「コピーしました」を出しておく時間
const COPIED_MS = 2000;

/** gameIds のスコアの公開ページの URL をクリップボードに写すボタン。スコアを全体公開している人にだけ出す */
export default function ShareUrlButton({ gameIds }: Props) {
  const T = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    const url = scoreShareUrl(window.location.origin, gameIds);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // クリップボードに書けない(許可が無い・http で開いた)ときは、URL を選んで写せるように出す
      window.prompt(T.profile.scoreLog.shareUrlPrompt, url);
    }
  }

  return (
    <button
      type="button"
      className="ShareUrlButton"
      onClick={copy}
    >
      {copied ? T.profile.scoreLog.copiedShareUrl : T.profile.scoreLog.copyShareUrl}
    </button>
  );
}
