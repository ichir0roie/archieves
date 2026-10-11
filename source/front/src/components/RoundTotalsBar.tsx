"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/text";

type Props = {
  roundTotal: number;
  /** エンドごとの合計。矢の無いエンドは null */
  endTotals: Array<number | null>;
  /** 今のエンドの番号(1 から) */
  endNumber: number;
};

/** 点数の入力の上に出す、今のラウンドの合計点とエンドごとの点数の一行 */
export default function RoundTotalsBar({ roundTotal, endTotals, endNumber }: Props) {
  const T = useT();
  const currentRef = useRef<HTMLDivElement>(null);

  // エンドが多いと横にはみ出すので、今のエンドを見える所へ寄せる
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [endNumber]);

  return (
    <div className="RoundTotalsBar round-totals">
      <div className="RoundTotal round-total">
        <span className="label">{T.game.entry.roundTotal}</span>
        <b>{roundTotal}</b>
      </div>
      <div className="ends">
        {endTotals.map((total, index) => {
          const isCurrent = index + 1 === endNumber;
          return (
            <div
              key={index}
              ref={isCurrent ? currentRef : undefined}
              className={isCurrent ? "EndTotalCell end current" : "EndTotalCell end"}
            >
              <span className="number">{index + 1}</span>
              <span className="value">{total ?? T.none}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
