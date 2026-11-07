"use client";

import type { AiCommentRead } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

type Props = {
  aiComment: AiCommentRead;
};

/**
 * スコアの画面の最後に出す、AI(Claude Code など)の指摘・改善点。
 * AI コメントは Claude Code が本人のトークンで API に書くので、画面では読む・消すだけにする。
 * 消すのは画面の右上の設定から。無いときは呼ぶ側が出さない(機能があることも見せない)
 */
export default function AiCommentPanel({ aiComment }: Props) {
  const T = useT();
  const texts = T.profile.scoreView.ai;

  return (
    <section className="AiComment panel stack tight">
      <h2>{texts.title}</h2>
      <p className="AiCommentText pre-wrap">{aiComment.body}</p>
      <span className="muted small">
        {texts.author(aiComment.author, formatDateTime(aiComment.updated_at))}
      </span>
    </section>
  );
}
