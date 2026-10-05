"use client";

import CommentField from "@/components/CommentField";
import { type CommentTarget } from "@/lib/comment";
import type { ScoreComments } from "@/lib/score/useScoreGame";
import { T } from "@/lib/text";

type Props = {
  comments: ScoreComments;
  roundNumber: number;
  endNumber: number;
  onSave: (target: CommentTarget, body: string) => Promise<void>;
  disabled?: boolean;
};

/** 記録中のエンド・ラウンド・ゲームのコメント。点数のすぐ下に置き、左のアイコンから書く */
export default function CommentBar(props: Props) {
  const rows: Array<{ target: CommentTarget; title: string; body: string | null }> = [
    {
      target: "end",
      title: T.game.comment.endTitle(props.endNumber),
      body: props.comments.end,
    },
    {
      target: "round",
      title: T.game.comment.roundTitle(props.roundNumber),
      body: props.comments.round,
    },
    {
      target: "game",
      title: T.game.comment.gameTitle,
      body: props.comments.game,
    },
  ];

  return (
    <div className="CommentBar comment-bar">
      {rows.map((row) => (
        <div
          key={row.target}
          className="row"
        >
          <span className="title">{row.title}</span>
          <CommentField
            title={row.title}
            body={row.body}
            emptyText={T.game.comment.empty}
            disabled={props.disabled}
            onSave={(body) => props.onSave(row.target, body)}
          />
        </div>
      ))}
    </div>
  );
}
