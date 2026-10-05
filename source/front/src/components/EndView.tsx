"use client";

import RoundPointValue from "@/components/RoundPointValue";
import { totalScore } from "@/lib/score/scoreFunctions";
import { PointRead } from "@/lib/api";

type Props = {
  points?: Array<PointRead>;
  /** 1エンドが満ちたときの矢の数。矢が入るあいだも帯の高さを変えないため */
  endSize?: number;
};

/**
 * 記録中のエンド。予定の矢の数だけ枠を並べ、エンドの合計を添える。
 * 枠の数はエンドのあいだ変えない。エンドの途中で下の的が指の下からずれないように。
 */
export default function EndView(props: Props) {
  const points = props.points ?? [];
  const slotCount = Math.max(props.endSize ?? points.length, points.length, 1);
  const slots = Array.from({ length: slotCount }, (_, index) => points[index] ?? null);

  return (
    <div className="EndView end-view">
      <div
        className="slots"
        style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
      >
        {slots.map((point, index) => (
          <RoundPointValue
            key={index}
            value={point?.score ?? null}
          />
        ))}
      </div>
      <div className="EndTotal total">{totalScore(points)}</div>
    </div>
  );
}
