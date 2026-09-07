"use client";

import RoundPointValue from "@/components/atoms/RoundPointValue";
import { PointRead } from "@/lib/api";

interface Props {
  points?: Array<PointRead>;
}

export default function EndView(props: Props) {
  const valueElements = props.points?.map((point, index) => {
    return (
      <div key={index}>
        <RoundPointValue value={point.score} />
      </div>
    );
  });

  return (
    <div className="EndView w-full px-4 py-2">
      <div className="flex flex-wrap justify-center gap-3">
        {valueElements}
      </div>
    </div>
  );
}
