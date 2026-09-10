"use client";

import ScoreEntryActions from "@/components/templates/score/scoreInput/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/templates/score/ScoreEntryShell";
import { bgColorPallet, scoreToStr } from "@/modules/data/score/scoreFunctions";
import { maxScoreForTargetType } from "@/modules/data/score/scoreConfig";

/** Highest score first (X/10, 9, ... 1, miss) to read like a target's rings. */
function scoreValues(maxScore: number): number[] {
  return Array.from({ length: maxScore + 1 }, (_, i) => maxScore - i);
}

export default function SimpleScoreInput(props: ScoreInputProps) {
  const maxScore = maxScoreForTargetType(props.targetType);

  return (
    <div className="SimpleScoreInput flex h-full w-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-4 gap-3 w-full max-w-md">
          {scoreValues(maxScore).map((score) => (
            <button
              key={score}
              disabled={props.isEndFull || props.disabled}
              onClick={() => props.next(score, 0, 0)}
              className={`${bgColorPallet(score)} aspect-square rounded-2xl border border-gray-400 shadow-sm text-lg font-bold flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 ${
                score >= 3 ? "text-white" : "text-black"
              }`}
            >
              {scoreToStr(score)}
            </button>
          ))}
        </div>
      </div>

      <ScoreEntryActions {...props} />
    </div>
  );
}
