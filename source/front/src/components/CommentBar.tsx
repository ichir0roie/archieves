"use client";

import CommentField from "@/components/CommentField";
import { type CommentTarget } from "@/lib/comment";
import type { ScoreComments } from "@/lib/score/useScoreGame";
import { useT } from "@/lib/text";

type Props = {
  comments: ScoreComments;
  roundNumber: number;
  endNumber: number;
  /** ラウンドの最後のエンドまで矢が埋まった。ラウンドのコメントはこのときだけ書ける */
  isRoundFull: boolean;
  onSave: (target: CommentTarget, body: string) => Promise<void>;
  disabled?: boolean;
};

/** 記録中のエンドのコメントと、ラウンドが埋まったときのラウンドのコメント。点数のすぐ下に置き、枠のどこを押しても書ける。ゲームのコメントはスコア表示でだけ書く */
export default function CommentBar(props: Props) {
  const T = useT();
  const allRows: Array<{ target: CommentTarget; title: string; body: string | null }> = [
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
  ];
  const rows = allRows.filter((row) => row.target !== "round" || props.isRoundFull);

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
