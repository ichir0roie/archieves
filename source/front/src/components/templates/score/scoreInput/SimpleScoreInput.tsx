"use client";

import { Button } from "@mui/material";
import { PointRead } from "@/lib/api";
import { bgColorPallet, scoreToStr } from "@/modules/data/score/scoreFunctions";

interface Props {
  points: Array<PointRead> | null | undefined;
  next: (point: number, x?: number, y?: number) => void;
  nextEnd: () => void;
  back: () => void;
  finish: () => void;
  pointSize: number | null | undefined;
  /** True while a previous entry's API call is still in flight; blocks further taps so they can't race it. */
  disabled?: boolean;
}

// Highest score first (X, 10, 9, ... 1, miss) to read like a target's rings.
const SCORE_VALUES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

export default function SimpleScoreInput(props: Props) {
  const isEndFull =
    props.pointSize != null && (props.points?.length ?? 0) >= props.pointSize;

  return (
    <div className="SimpleScoreInput flex h-full w-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-4 gap-3 w-full max-w-md">
          {SCORE_VALUES.map((score) => (
            <button
              key={score}
              disabled={isEndFull || props.disabled}
              onClick={() => props.next(score, 0, 0)}
              className={`${bgColorPallet(score)} aspect-square rounded-2xl border border-gray-400 shadow-sm text-lg font-bold flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 ${
                score >= 3 && score !== 0 ? "text-white" : "text-black"
              }`}
            >
              {scoreToStr(score)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-3 border-t border-slate-200 p-3">
        <Button variant="outlined" onClick={props.back} disabled={props.disabled}>
          戻る
        </Button>
        <Button variant="outlined" onClick={props.nextEnd} disabled={props.disabled}>
          次へ
        </Button>
        <Button variant="contained" onClick={props.finish} disabled={props.disabled}>
          終了
        </Button>
      </div>
    </div>
  );
}
