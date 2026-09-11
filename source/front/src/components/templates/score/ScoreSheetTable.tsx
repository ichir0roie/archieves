"use client";

import { useEffect, useRef, type RefObject } from "react";
import { scoreToStr, totalScore } from "@/modules/data/score/scoreFunctions";
import type { SheetRound } from "@/modules/data/score/scoreManager";

interface Props {
  sheet: Array<SheetRound>;
}

export default function ScoreSheetTable(props: Props) {
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(
    () => {
      currentRowRef.current?.scrollIntoView({ block: "nearest" });
    },
    [props.sheet]
  );

  return (
    <div className="ScoreSheet min-h-0 flex-1 overflow-y-auto bg-slate-50 px-2 pb-2">
      {props.sheet.map((round) => (
        <ScoreSheetRound
          key={round.number}
          round={round}
          currentRowRef={currentRowRef}
        />
      ))}
    </div>
  );
}

interface RoundProps {
  round: SheetRound;
  currentRowRef: RefObject<HTMLTableRowElement | null>;
}

function ScoreSheetRound(props: RoundProps) {
  const arrowColumns = Array.from(
    { length: props.round.endSize },
    (_, index) => index + 1
  );

  let runningTotal = 0;
  const rows = props.round.ends.map((end) => {
    const endTotal = totalScore(end.points);
    runningTotal += endTotal;
    return {
      ...end,
      endTotal,
      runningTotal,
    };
  });

  return (
    <div className="SheetRound pt-2">
      <div className="sticky top-0 z-10 flex items-baseline justify-between bg-slate-50 py-1 text-base font-bold text-slate-700">
        <span>ラウンド {props.round.number}</span>
        <span className="RoundTotal text-sm font-semibold text-slate-500">
          計 {runningTotal}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr className="bg-slate-100 text-xs text-slate-500">
            <th className="w-14 border border-slate-300 py-1 font-semibold">
              END
            </th>
            {arrowColumns.map((arrowNumber) => (
              <th
                key={arrowNumber}
                className="border border-slate-300 py-1 font-normal"
              >
                {arrowNumber}
              </th>
            ))}
            <th className="w-12 border border-slate-300 py-1 font-semibold">
              小計
            </th>
            <th className="w-14 border border-slate-300 py-1 font-semibold">
              累計
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.number}
              ref={row.isCurrent ? props.currentRowRef : undefined}
              className={`SheetEndRow ${row.isCurrent ? "CurrentEnd bg-sky-100 ring-2 ring-inset ring-sky-400" : "bg-white"}`}
            >
              <td className="border border-slate-300 py-1.5 text-xl font-bold text-slate-700">
                {row.number}
              </td>
              {arrowColumns.map((arrowNumber) => {
                const point = row.points[arrowNumber - 1];
                return (
                  <td
                    key={arrowNumber}
                    className={`ArrowCell border border-slate-300 py-1.5 text-2xl font-bold leading-none ${point ? "ArrowValue text-slate-900" : "text-slate-300"}`}
                  >
                    {point ? scoreToStr(point.score) : "・"}
                  </td>
                );
              })}
              <td className="EndTotal border border-slate-300 py-1.5 text-xl font-bold text-slate-700">
                {row.endTotal}
              </td>
              <td className="RunningTotal border border-slate-300 py-1.5 text-xl font-semibold text-slate-500">
                {row.runningTotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
