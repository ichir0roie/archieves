"use client";

import ScoreEntryActions from "@/components/ScoreEntryActions";
import ScoreSheetTable from "@/components/ScoreSheetTable";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass, scoreToStr } from "@/lib/score/scoreFunctions";
import { maxScoreForTargetType } from "@/lib/score/scoreConfig";

/** 的の帯と同じ並びに読めるよう、高い点から(X/10, 9, … 1, 外れ) */
function scoreValues(maxScore: number): number[] {
  return Array.from({ length: maxScore + 1 }, (_, i) => maxScore - i);
}

/** 点数だけの入力。片手で持つ前提で、上半分に全体の点数表、下半分に親指の届くキーを並べる */
export default function SimpleScoreInput(props: ScoreInputProps) {
  const maxScore = maxScoreForTargetType(props.targetType);

  return (
    <div className="SimpleScoreInput simple-input">
      <ScoreSheetTable sheet={props.sheet} />

      {props.commentBar}

      <div className="ScoreKeypad keypad">
        <div className="keys">
          {scoreValues(maxScore).map((score) => (
            <button
              key={score}
              type="button"
              className={ringClass(score)}
              disabled={props.isEndFull || props.disabled}
              onClick={() => props.next(score, 0, 0)}
            >
              {scoreToStr(score)}
            </button>
          ))}
        </div>

        <ScoreEntryActions {...props} />
      </div>
    </div>
  );
}
