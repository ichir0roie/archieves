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

/**
 * 得点の帯の外側の半径を、的の半径に対する割合で返す。WA の的は半径を 10 等分した帯で、
 * 内側が 10、外側が 1。X は独立した帯でなく、10 の帯の内側半分。
 */
export function zoneRadiusRatio(score: number): number {
  if (score >= X_SCORE) return 1 / (MAX_RING_SCORE * 2);
  return (MAX_RING_SCORE + 1 - score) / MAX_RING_SCORE;
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

/** 矢の集まりの X・10・M(外れ)の本数。X は 10 に数えず、10 は X を含まない */
export function countRings(points: Array<Pick<PointRead, "score">>) {
  let x = 0;
  let ten = 0;
  let miss = 0;
  for (const point of points) {
    const label = scoreToStr(point.score);
    if (label === "X") x += 1;
    else if (label === String(MAX_RING_SCORE)) ten += 1;
    else if (label === "M") miss += 1;
  }
  return { x, ten, miss };
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
