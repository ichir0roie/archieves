"use client";

import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { T } from "@/lib/text";

/** 戻る / 次へ / 終了。どちらの入力でも使う */
export default function ScoreEntryActions(props: ScoreInputProps) {
  return (
    <div className="ScoreEntryActions score-actions">
      <button
        type="button"
        onClick={props.back}
        disabled={props.disabled}
      >
        {T.game.entry.back}
      </button>
      <button
        type="button"
        className={props.isEndFull && !props.isGameComplete ? "primary" : undefined}
        onClick={props.nextEnd}
        disabled={props.disabled || props.isGameComplete}
      >
        {T.game.entry.next}
      </button>
      <button
        type="button"
        className={props.isGameComplete ? "success" : "primary"}
        onClick={props.finish}
        disabled={props.disabled}
      >
        {T.game.entry.finish}
      </button>
    </div>
  );
}
