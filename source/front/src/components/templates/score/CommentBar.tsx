"use client";

import CommentField from "@/components/templates/common/CommentField";
import { type CommentTarget } from "@/modules/data/comment/commentConfig";
import type { ScoreComments } from "@/modules/data/score/useScoreGame";

interface Props {
  comments: ScoreComments;
  roundNumber: number;
  endNumber: number;
  onSave: (target: CommentTarget, body: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * The notes on the end, the round and the game being recorded, sitting
 * right under the scores they belong to. Each row shows the text already
 * stored and opens its editor from the icon on its left.
 */
export default function CommentBar(props: Props) {
  const rows: Array<{ target: CommentTarget; title: string; body: string | null }> = [
    { target: "end", title: `END ${props.endNumber}`, body: props.comments.end },
    {
      target: "round",
      title: `ラウンド ${props.roundNumber}`,
      body: props.comments.round,
    },
    { target: "game", title: "ゲーム", body: props.comments.game },
  ];

  return (
    <div className="CommentBar w-full shrink-0 border-y border-slate-200 bg-white px-3 py-0.5">
      {rows.map((row) => (
        <div key={row.target} className="flex items-center gap-1">
          <span className="w-16 shrink-0 text-[10px] font-semibold text-slate-400">
            {row.title}
          </span>
          <CommentField
            title={row.title}
            body={row.body}
            emptyText="コメントを追加"
            disabled={props.disabled}
            onSave={(body) => props.onSave(row.target, body)}
            className="flex-1"
          />
        </div>
      ))}
    </div>
  );
}
