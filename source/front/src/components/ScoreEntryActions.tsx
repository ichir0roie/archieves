"use client";

import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { useT } from "@/lib/text";

/** 1矢戻る・進む / 1エンド戻る・進む / 保存・終了 */
export default function ScoreEntryActions(props: ScoreInputProps) {
  const T = useT();
  return (
    <div className="ScoreEntryActions score-actions">
      <button
        type="button"
        onClick={props.backPoint}
        disabled={props.disabled || !props.canBackPoint}
      >
        {T.game.entry.backPoint}
      </button>
      <button
        type="button"
        onClick={props.forwardPoint}
        disabled={props.disabled || !props.canForwardPoint}
      >
        {T.game.entry.forwardPoint}
      </button>
      <button
        type="button"
        onClick={props.backEnd}
        disabled={props.disabled || !props.canBackEnd}
      >
        {T.game.entry.backEnd}
      </button>
      <button
        type="button"
        className={props.isEndFull && !props.isGameComplete ? "primary" : undefined}
        onClick={props.forwardEnd}
        disabled={props.disabled || !props.canForwardEnd}
      >
        {T.game.entry.forwardEnd}
      </button>
      <button
        type="button"
        className="ScoreSave"
        onClick={props.save}
        disabled={props.disabled || !props.hasUnsavedChanges}
      >
        {props.hasUnsavedChanges ? T.save : T.game.entry.saved}
      </button>
      <button
        type="button"
        className={`finish ${props.isGameComplete ? "success" : "primary"}`}
        onClick={props.finish}
        disabled={props.disabled}
      >
        {T.game.entry.finish}
      </button>
    </div>
  );
}
