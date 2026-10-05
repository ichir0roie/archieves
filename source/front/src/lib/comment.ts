/** Mirrors archieves-api's app/core/comments.py MAX_COMMENT_LENGTH. */
export const MAX_COMMENT_LENGTH = 1000;

/** What a comment can be attached to. */
export type CommentTarget = "game" | "round" | "end";

export const COMMENT_TARGET_LABELS: Record<CommentTarget, string> = {
  game: "ゲーム",
  round: "ラウンド",
  end: "エンド",
};
