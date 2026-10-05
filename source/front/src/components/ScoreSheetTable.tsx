"use client";

import { useEffect, useRef, type RefObject } from "react";
import { scoreToStr, totalScore } from "@/lib/score/scoreFunctions";
import type { SheetRound } from "@/lib/score/scoreManager";
import { T } from "@/lib/text";

type Props = {
  sheet: Array<SheetRound>;
};

export default function ScoreSheetTable(props: Props) {
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(
    () => {
      currentRowRef.current?.scrollIntoView({ block: "nearest" });
    },
    [props.sheet]
  );

  return (
    <div className="ScoreSheet score-sheet">
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

type RoundProps = {
  round: SheetRound;
  currentRowRef: RefObject<HTMLTableRowElement | null>;
};

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
    <div className="SheetRound">
      <div className="sheet-round-head">
        <span>{T.game.sheet.round(props.round.number)}</span>
        <span className="RoundTotal round-total">{T.game.sheet.roundTotal(runningTotal)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th className="end-col">{T.game.sheet.end}</th>
            {arrowColumns.map((arrowNumber) => (
              <th key={arrowNumber}>{arrowNumber}</th>
            ))}
            <th className="sum-col">{T.game.sheet.subtotal}</th>
            <th className="run-col">{T.game.sheet.running}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.number}
              ref={row.isCurrent ? props.currentRowRef : undefined}
              className={`SheetEndRow ${row.isCurrent ? "CurrentEnd current" : ""}`}
            >
              <td>{row.number}</td>
              {arrowColumns.map((arrowNumber) => {
                const point = row.points[arrowNumber - 1];
                return (
                  <td
                    key={arrowNumber}
                    className={`ArrowCell arrow-cell ${point ? "ArrowValue" : "blank"}`}
                  >
                    {point ? scoreToStr(point.score) : T.game.sheet.blankArrow}
                  </td>
                );
              })}
              <td className="EndTotal">{row.endTotal}</td>
              <td className="RunningTotal running">{row.runningTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
