"use client";

import RoundPointValue from "@/components/RoundPointValue";
import { totalScore } from "@/lib/score/scoreFunctions";
import { PointRead } from "@/lib/api";

interface Props {
  points?: Array<PointRead>;
  /** Arrows this end holds when full, so the row keeps its height as they come in. */
  endSize?: number;
}

/**
 * The end in progress: one slot per planned arrow plus the end's total. The
 * slot count is fixed for the whole end so the target below it never shifts
 * under the player's finger mid-end.
 */
export default function EndView(props: Props) {
  const points = props.points ?? [];
  const slotCount = Math.max(props.endSize ?? points.length, points.length, 1);
  const slots = Array.from({ length: slotCount }, (_, index) => points[index] ?? null);

  return (
    <div className="EndView w-full shrink-0 px-4 py-2">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div
          className="grid flex-1 gap-1.5"
          style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
        >
          {slots.map((point, index) => (
            <RoundPointValue key={index} value={point?.score ?? null} />
          ))}
        </div>
        <div className="EndTotal w-10 shrink-0 text-right text-base font-bold text-slate-700">
          {totalScore(points)}
        </div>
      </div>
    </div>
  );
}
