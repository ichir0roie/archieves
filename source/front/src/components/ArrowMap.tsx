import type { PointRead } from "@/lib/api";
import { resolveTargetType } from "@/lib/score/scoreConfig";
import { ringClass, zoneRadiusRatio } from "@/lib/score/scoreFunctions";

type Props = {
  points: Array<Pick<PointRead, "x" | "y">>;
  targetType: string | null | undefined;
};

/** 辺を 100 とした枠の中心。座標は的の入力と同じく、枠に対する 0〜1 の割合(0.5 が中心) */
const SIZE = 100;

/**
 * 記録したすべての矢の位置を、一枚の的に重ねて描く。
 * (0, 0) は位置の無い矢(かつて点数だけを入力した記録)の値なので描かない。
 */
export function hasPosition(point: Pick<PointRead, "x" | "y">): boolean {
  return point.x != null && point.y != null && !(point.x === 0 && point.y === 0);
}

export default function ArrowMap({ points, targetType }: Props) {
  const { ringCount } = resolveTargetType(targetType);
  const placed = points.filter(hasPosition);
  // 外側の帯から順に重ねる
  const scores = Array.from({ length: ringCount }, (_, index) => index + 1);

  return (
    <svg
      className="ArrowMap arrow-map"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="すべての矢の位置"
    >
      {scores.map((score) => (
        <circle
          key={score}
          className={ringClass(score)}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={(SIZE / 2) * zoneRadiusRatio(score)}
          fill="var(--ring)"
          stroke="#6a7080"
          strokeWidth={0.2}
        />
      ))}
      {placed.map((point, index) => (
        <circle
          key={index}
          cx={point.x * SIZE}
          cy={point.y * SIZE}
          r={1.2}
          fill="#fff"
          stroke="#000"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}
