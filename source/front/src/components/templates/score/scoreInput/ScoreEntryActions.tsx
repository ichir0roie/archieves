"use client";

import { Button } from "@mui/material";
import type { ScoreInputProps } from "@/components/templates/score/ScoreEntryShell";

/** 戻る / 次へ / 終了, shared by both input modes. */
export default function ScoreEntryActions(props: ScoreInputProps) {
  return (
    <div className="ScoreEntryActions grid shrink-0 grid-cols-3 gap-3 border-t border-slate-200 p-3">
      <Button variant="outlined" onClick={props.back} disabled={props.disabled}>
        戻る
      </Button>
      <Button
        variant={props.isEndFull && !props.isGameComplete ? "contained" : "outlined"}
        onClick={props.nextEnd}
        disabled={props.disabled || props.isGameComplete}
      >
        次へ
      </Button>
      <Button
        variant="contained"
        color={props.isGameComplete ? "success" : "primary"}
        onClick={props.finish}
        disabled={props.disabled}
      >
        終了
      </Button>
    </div>
  );
}
