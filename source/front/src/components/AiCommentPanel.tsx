"use client";

import type { AiCommentRead } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

type Props = {
  aiComment: AiCommentRead | null;
  onDelete: () => void;
  deleting?: boolean;
};

/**
 * スコアの画面の最後に出す、AI(Claude Code など)の指摘・改善点。
 * AI コメントは Claude Code が本人のトークンで API に書くので、画面では読む・消すだけにする
 */
export default function AiCommentPanel({ aiComment, onDelete, deleting }: Props) {
  const T = useT();
  const texts = T.profile.scoreView.ai;

  return (
    <section className="AiComment panel stack tight">
      <h2>{texts.title}</h2>
      {aiComment ? (
        <>
          <p className="AiCommentText pre-wrap">{aiComment.body}</p>
          <span className="muted small">
            {texts.author(aiComment.author, formatDateTime(aiComment.updated_at))}
          </span>
        </>
      ) : (
        <p className="muted small">{texts.empty}</p>
      )}
      {aiComment && (
        <button
          type="button"
          className="danger block"
          onClick={onDelete}
          disabled={deleting}
        >
          {texts.delete}
        </button>
      )}
    </section>
  );
}
