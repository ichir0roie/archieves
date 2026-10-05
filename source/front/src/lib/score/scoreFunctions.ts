import { MAX_RING_SCORE, MISS_SCORE, X_SCORE } from "./scoreConfig";
import type { PointRead } from "@/lib/api";

/**
 * How a stored ring reads on the score sheet: "X" for the inner ten, "M" for
 * a miss. Legacy-imported arrows whose ring the old client never resolved
 * are stored negative (see the API's app/services/legacy_import.py) and read
 * as misses too.
 */
export function scoreToStr(point: number) {
  if (point <= MISS_SCORE) return "M";
  if (point >= X_SCORE) return "X";
  return point.toString();
}

/** The points a stored ring is worth - mirrors the API's scored_value(). */
export function scoreToInt(point: number) {
  if (point >= X_SCORE) return MAX_RING_SCORE;
  if (point <= MISS_SCORE) return MISS_SCORE;
  return point;
}

export function totalScore(points: Array<Pick<PointRead, "score">>): number {
  return points.reduce((total, point) => total + scoreToInt(point.score), 0);
}

/**
 * 的の色の帯(globals.css の .ring-*)。中身は --ring(帯の色)と --ring-ink(その上の文字の色)で、
 * 使う側が背景・枠のどちらに塗るかを決める。
 */
export function ringClass(point: number): string {
  if (point >= 9) return "ring-gold";
  if (point >= 7) return "ring-red";
  if (point >= 5) return "ring-blue";
  if (point >= 3) return "ring-black";
  if (point >= 1) return "ring-white";
  return "ring-miss";
}
