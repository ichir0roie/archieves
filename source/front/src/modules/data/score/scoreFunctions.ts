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

// ここを共通化すると、tailwindcssが反応しない
export function bgColorPallet(point: number): string {
  if (point >= 9) return "bg-yellow-500";
  if (point >= 7) return "bg-red-500";
  if (point >= 5) return "bg-blue-500";
  if (point >= 3) return "bg-black";
  if (point >= 1) return "bg-white";
  return "bg-gray-200";
}

export function borderColorPallet(point: number): string {
  if (point >= 9) return "border-yellow-500";
  if (point >= 7) return "border-red-500";
  if (point >= 5) return "border-blue-500";
  if (point >= 3) return "border-gray-700";
  if (point >= 1) return "border-gray-400";
  return "border-gray-200";
}
