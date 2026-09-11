"use client";

import ScoreEntryActions from "@/components/templates/score/scoreInput/ScoreEntryActions";
import ScoreSheetTable from "@/components/templates/score/ScoreSheetTable";
import type { ScoreInputProps } from "@/components/templates/score/ScoreEntryShell";
import { bgColorPallet, scoreToStr } from "@/modules/data/score/scoreFunctions";
import { maxScoreForTargetType } from "@/modules/data/score/scoreConfig";

/** Highest score first (X/10, 9, ... 1, miss) to read like a target's rings. */
function scoreValues(maxScore: number): number[] {
  return Array.from({ length: maxScore + 1 }, (_, i) => maxScore - i);
}

/**
 * Score-only entry, laid out for a phone held one-handed: the whole game's
 * score sheet scrolls in the top half, every key sits in the bottom half
 * within thumb reach.
 */
export default function SimpleScoreInput(props: ScoreInputProps) {
  const maxScore = maxScoreForTargetType(props.targetType);

  return (
    <div className="SimpleScoreInput flex h-full w-full flex-col">
      <ScoreSheetTable sheet={props.sheet} />

      <div className="ScoreKeypad flex h-1/2 shrink-0 flex-col border-t-2 border-slate-300 bg-white">
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-4 gap-2 p-2">
          {scoreValues(maxScore).map((score) => (
            <button
              key={score}
              disabled={props.isEndFull || props.disabled}
              onClick={() => props.next(score, 0, 0)}
              className={`${bgColorPallet(score)} rounded-2xl border border-gray-400 shadow-sm text-3xl font-bold flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 ${
                score >= 3 ? "text-white" : "text-black"
              }`}
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
