/**
 * 写真の中の矢を見つけ、刺さった点を推測する。
 *
 * 矢は、色の目立つノックから軸(暗い直線)をたどって見つける。
 * 1. ノックの色の小さな塊を取る。色はゲームのノックの色(本人の矢の写真から測った色)の近く。
 *    決めていなければ(写真モードの前に始めた古いゲーム)、よくある蛍光の緑・オレンジ・ピンク
 * 2. 塊ごとに、ノックの延長線上に乗った線分(LSD)を集めて軸の向きを決める。刺さった点はノックより
 *    的の側にあるので、ノックから的の中心への向きに近いものだけを見る。
 *    たどれなかったノックは、たどれた軸の直線が集まる点(矢の向きの消失点)への向きでたどり直す。
 *    的の中心の近くのノックは、中心への向きが軸の向きと大きくずれるため
 * 3. 軸の向きは、乗った線分に直線を当て直して決める(粗い向きのままだと、遠くの軸が幅から外れて
 *    途中で止まる)
 * 4. 軸に沿って、軸と平行な線分で埋まった所を足し、空いた所を引いて、和がいちばん大きい所を
 *    刺さった点とする。羽根・印字・黒の帯の上で途切れて見える軸を越え、的の面に出たら止まる。
 *    軸と向きの違う短い線分(穴の縁)は数えないので、穴だらけの金・赤の帯で先まで行き過ぎない
 * 5. 羽根の色が決まっていれば、ノックの近くに羽根の色があるものを確からしくする
 * 6. 確からしい順に並べ、先に選んだものとほぼ同じ所の推測(同じ矢)を除く
 *
 * 刺さった点は的に対する割合(target.ts)に直して返す。人が直す下書きなので、
 * 見つけたものを確からしい順に並べて返し、本数で切るのは呼ぶ側(画面)に任せる。
 *
 * 数字は、手で付けた正解と比べて決めた(scripts/photo-eval.ts)。変えたらそれで確かめる。
 */

import type { ArrowColor } from "@/lib/api/schemas";
import { connectedComponents, open2x2, type HsvImage, type Mask } from "./image";
import { detectLineSegments } from "./lsd";
import { project } from "./matrix";
import type { TargetFit } from "./target";

type HsvRange = [[number, number, number], [number, number, number]];

/** 色の範囲(OpenCV の HSV。色相は 0〜180)。ノックは蛍光色が多いので、彩度・明度を高く取る */
export const COLOR_RANGES: Record<ArrowColor, HsvRange[]> = {
  white: [[[0, 0, 190], [180, 45, 255]]],
  black: [[[0, 0, 0], [180, 255, 55]]],
  red: [
    [[0, 170, 120], [4, 255, 255]],
    [[170, 170, 120], [180, 255, 255]],
  ],
  orange: [[[0, 190, 150], [16, 255, 255]]],
  yellow: [[[22, 170, 190], [36, 255, 255]]],
  green: [[[45, 170, 120], [85, 255, 255]]],
  blue: [[[100, 120, 60], [128, 255, 255]]],
  purple: [[[128, 80, 60], [150, 255, 255]]],
  pink: [[[145, 150, 170], [172, 255, 255]]],
};
/** ノックの色を決めていないときに探す色 */
const DEFAULT_NOCK_COLORS: ArrowColor[] = ["green", "orange", "pink"];
/**
 * 測ったノックの色からの幅(OpenCV の HSV)。色相は光で変わりにくいので狭く、彩度・明度は日なた・
 * 日陰で大きく変わるので、測った値の割合を下限にする
 */
const NOCK_HUE_RANGE = 10;
const NOCK_MIN_SATURATION_RATIO = 0.5;
const NOCK_MIN_VALUE_RATIO = 0.45;
/** これより彩度の低い色(白・黒・灰)は色相が決まらないので、明るさで探す */
export const ACHROMATIC_SATURATION = 60;
/**
 * 刺さった点が的の中心からこれより遠い(的に対する割合)ものは、矢でない(台・背景の色の塊から
 * たどった線)とみなす。的紙の外の畳に刺さった矢までは拾う
 */
const MAX_ENTRY_DISTANCE = 0.62;
/** 軸をたどるときの刻み(px)と、軸の見えない所 1 刻みの重み(見えている所は 1) */
const TRACE_STEP_PX = 2.0;
const SHAFT_GAP_COST = 0.4;
/** これより近い推測は同じ矢とみなす(的に対する割合)。80cm の的で 8mm、矢の太さほど */
const DUPLICATE_DISTANCE = 0.01;
/** たどる向きと、ノックから的の中心への向きの差の上限(度) */
const MAX_OUTWARD_ANGLE = 60;
/** 写真の上の軸の長さの上限と、線分を軸に乗っているとみなす幅(的の半径に対する割合) */
const MAX_SHAFT_LENGTH = 1.3;
const SHAFT_TOLERANCE = 0.012;
/** 線分を軸の縁とみなす、軸の向きとの角の上限(度)。3〜8 度で結果はほとんど変わらない */
const SHAFT_ALIGN_DEGREES = 5;
/**
 * 軸の直線を当て直すときの、線分を拾う幅の倍率(広めから狭めへ)。広げすぎると、まとまって
 * 刺さった隣の矢の軸まで拾い、そちらへ乗り換える
 */
const SHAFT_REFIT_WIDENING = [1.5, 1.0];
/**
 * 消失点を求める直線の広がりの下限(重みの和に対する、いちばん弱い向きの割合)。
 * 軸がほぼ平行なら求めない
 */
const VANISHING_MIN_SPREAD = 0.02;
/** 消失点からこれより近い(的の半径に対する割合)ノックは、カメラの方を向いた矢で、軸の向きが決まらない */
const VANISHING_NEAR = 0.1;
/** LSD の線分のうち、これより短いものは軸に使わない(px) */
const MIN_SEGMENT_PX = 12;

type Vec = [number, number];

export type DetectedArrow = {
  /** 刺さった点(的に対する割合) */
  x: number;
  y: number;
  confidence: number;
};

/** 線分の端(x1, y1, x2, y2 の並び) */
export type Segments = Float32Array;

function rangeMask(hsv: HsvImage, ranges: HsvRange[]): Mask {
  const { width, height, h, s, v } = hsv;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    for (const [low, high] of ranges) {
      if (h[i] >= low[0] && h[i] <= high[0] && s[i] >= low[1] && s[i] <= high[1] && v[i] >= low[2] && v[i] <= high[2]) {
        data[i] = 1;
        break;
      }
    }
  }
  return { width, height, data };
}

/** OpenCV の 8 ビットの HSV(色相 0〜180) */
function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const diff = max - Math.min(r, g, b);
  let hue = 0;
  if (diff > 0) {
    if (max === r) hue = (g - b) / diff;
    else if (max === g) hue = (b - r) / diff + 2;
    else hue = (r - g) / diff + 4;
    hue = Math.round(hue * 30);
    if (hue < 0) hue += 180;
  }
  return [hue, max === 0 ? 0 : Math.round((255 * diff) / max), max];
}

/** 測ったノックの色(#rrggbb)の近くの、HSV の範囲 */
export function nockRanges(hex: string): HsvRange[] {
  const [h, s, v] = hexToHsv(hex);
  if (s < ACHROMATIC_SATURATION) {
    // 白は明るい所、黒は暗い所。間の灰は明るさの近くだけ
    return [[[0, 0, Math.max(0, v - 60)], [180, ACHROMATIC_SATURATION, Math.min(255, v + 60)]]];
  }
  const lowS = Math.max(70, Math.round(s * NOCK_MIN_SATURATION_RATIO));
  const lowV = Math.max(70, Math.round(v * NOCK_MIN_VALUE_RATIO));
  const lowH = h - NOCK_HUE_RANGE;
  const highH = h + NOCK_HUE_RANGE;
  // 色相は 0 と 180 がつながっている(赤)
  if (lowH < 0) {
    return [
      [[0, lowS, lowV], [highH, 255, 255]],
      [[180 + lowH, lowS, lowV], [180, 255, 255]],
    ];
  }
  if (highH > 180) {
    return [
      [[lowH, lowS, lowV], [180, 255, 255]],
      [[0, lowS, lowV], [highH - 180, 255, 255]],
    ];
  }
  return [[[lowH, lowS, lowV], [highH, 255, 255]]];
}

/** ノックらしい塊の中心。大きさは的の大きさとの比で絞り、光で割れた一つのノックはまとめる */
export function findNocks(hsv: HsvImage, fit: TargetFit, ranges: HsvRange[]): Vec[] {
  const components = connectedComponents(open2x2(rangeMask(hsv, ranges)));
  const low = (fit.radius * 0.012) ** 2;
  const high = (fit.radius * 0.12) ** 2;
  const blobs: Array<[number, number, number]> = [];
  for (let label = 1; label < components.count; label++) {
    const area = components.area[label];
    if (area >= low && area <= high) blobs.push([components.centroidX[label], components.centroidY[label], area]);
  }
  // 大きい順。同じ大きさなら見つけた順(安定なソート)
  blobs.sort((a, b) => b[2] - a[2]);
  const merged: Array<[number, number, number]> = [];
  for (const [x, y, area] of blobs) {
    // 的から遠すぎる塊(隣の的の矢・背景)は使わない
    if (Math.hypot(x - fit.centerX, y - fit.centerY) > fit.radius * 2) continue;
    const near = merged.find((m) => Math.hypot(m[0] - x, m[1] - y) < fit.radius * 0.04);
    if (!near) {
      merged.push([x, y, area]);
      continue;
    }
    const total = near[2] + area;
    near[0] = (near[0] * near[2] + x * area) / total;
    near[1] = (near[1] * near[2] + y * area) / total;
    near[2] = total;
  }
  return merged.map(([x, y]) => [x, y]);
}

/** LSD の線分のうち、軸に使える長さのもの */
export function findSegments(gray: Uint8Array, width: number, height: number): Segments {
  const lines = detectLineSegments(gray, width, height);
  const kept: number[] = [];
  for (let i = 0; i + 3 < lines.length; i += 4) {
    if (Math.hypot(lines[i + 2] - lines[i], lines[i + 3] - lines[i + 1]) >= MIN_SEGMENT_PX) {
      kept.push(lines[i], lines[i + 1], lines[i + 2], lines[i + 3]);
    }
  }
  return Float32Array.from(kept);
}

function angleGap(a: number, b: number): number {
  const degrees = ((a - b) * 180) / Math.PI;
  return Math.abs((((degrees + 180) % 360) + 360) % 360 - 180);
}

export type Trace = {
  /** 刺さった点(画像の px) */
  end: Vec;
  /** ノックからの長さ(px) */
  length: number;
  /** 線分で埋まっている割合 */
  covered: number;
};

/** ノックから伸びる軸をたどる。たどれなければ null */
export function traceShaft(
  nock: Vec,
  segments: Segments,
  maxLength: number,
  tolerance: number,
  center: Vec,
): Trace | null {
  const [nx, ny] = nock;
  // 刺さった点はノックより的の側にある。的から遠ざかる向き(畳の筋・台の縁)はたどらない
  const inward = Math.atan2(center[1] - ny, center[0] - nx);
  const candidates: Array<[number, number]> = [];
  for (let i = 0; i < segments.length; i += 4) {
    const x1 = segments[i];
    const y1 = segments[i + 1];
    const x2 = segments[i + 2];
    const y2 = segments[i + 3];
    const d1 = Math.hypot(x1 - nx, y1 - ny);
    const d2 = Math.hypot(x2 - nx, y2 - ny);
    const [nearX, nearY, farX, farY] = d1 < d2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    if (Math.min(d1, d2) > maxLength * 0.5 || Math.max(d1, d2) > maxLength) continue;
    const angle = Math.atan2(farY - ny, farX - nx);
    // 線分の近い端が、ノックから遠い端へ向かう直線の近くにある(ノックの延長線上の線分)
    const offset = Math.abs((nearX - nx) * Math.sin(angle) - (nearY - ny) * Math.cos(angle));
    if (offset > tolerance || angleGap(angle, inward) > MAX_OUTWARD_ANGLE) continue;
    candidates.push([angle, Math.max(d1, d2) - Math.min(d1, d2)]);
  }
  if (candidates.length === 0) return null;
  // 5 度刻みの向きごとに線分の長さを足し、いちばん重い向きを軸の向きとする
  const bucket = (angle: number) => Math.round((angle * 180) / Math.PI / 5);
  const weights = new Map<number, number>();
  for (const [angle, length] of candidates) {
    const key = bucket(angle);
    weights.set(key, (weights.get(key) ?? 0) + length);
  }
  let best = 0;
  let bestWeight = -Infinity;
  for (const [key, weight] of weights) {
    const score = weight + ((weights.get(key - 1) ?? 0) + (weights.get(key + 1) ?? 0)) / 2;
    if (score > bestWeight) {
      best = key;
      bestWeight = score;
    }
  }
  const chosen = candidates.filter(([angle]) => Math.abs(bucket(angle) - best) <= 1).map(([angle]) => angle);
  const angle = Math.atan2(
    chosen.reduce((sum, a) => sum + Math.sin(a), 0) / chosen.length,
    chosen.reduce((sum, a) => sum + Math.cos(a), 0) / chosen.length,
  );
  let ux = Math.cos(angle);
  let uy = Math.sin(angle);
  // 多数決の向きは 5 度刻みで粗く、遠くの軸が幅から外れて途中で止まる。直線に乗った線分の端へ
  // 直線を当て直す(広めの幅で拾ってから、狭めの幅で)
  let ox = nx;
  let oy = ny;
  for (const widen of SHAFT_REFIT_WIDENING) {
    const on = onLine(segments, [ox, oy], [ux, uy], tolerance * widen, maxLength);
    if (on.length < 2) break;
    [[ox, oy], [ux, uy]] = fitLine(segments, on, [ux, uy]);
    // ノックを当て直した直線に落とした所を、たどる始まりにする
    const t = (nx - ox) * ux + (ny - oy) * uy;
    ox += ux * t;
    oy += uy * t;
  }
  // その直線に乗った線分で、ノックからの距離ごとに軸が見えている所を塗る
  const bins = new Uint8Array(Math.max(1, Math.ceil(maxLength / TRACE_STEP_PX)));
  for (const i of onLine(segments, [ox, oy], [ux, uy], tolerance, maxLength)) {
    const t1 = (segments[i] - ox) * ux + (segments[i + 1] - oy) * uy;
    const t2 = (segments[i + 2] - ox) * ux + (segments[i + 3] - oy) * uy;
    const from = Math.floor(Math.min(t1, t2) / TRACE_STEP_PX);
    const to = Math.min(bins.length, Math.ceil(Math.max(t1, t2) / TRACE_STEP_PX));
    bins.fill(1, from, to);
  }
  // 軸は羽根・印字・黒の帯の上で途切れて見える。見えている所を +1、空いた所を -SHAFT_GAP_COST と
  // して足し、和がいちばん大きい所を軸の終わりとする。隙間の先にまた軸が続けば越え、
  // 刺さった点より先(的の面)は空きが続くので止まる
  let gain = 0;
  let bestGain = -Infinity;
  let last = 0;
  for (let i = 0; i < bins.length; i++) {
    gain += bins[i] ? 1 : -SHAFT_GAP_COST;
    if (gain > bestGain) {
      bestGain = gain;
      last = i;
    }
  }
  const reach = (last + 1) * TRACE_STEP_PX;
  if (bestGain <= 0 || reach < maxLength * 0.1) return null;
  let covered = 0;
  for (let i = 0; i <= last; i++) covered += bins[i];
  return { end: [ox + ux * reach, oy + uy * reach], length: reach, covered: (covered * TRACE_STEP_PX) / reach };
}

/**
 * origin から direction へ伸びる直線(長さ maxLength、幅 width)に乗った線分の位置(segments の添字)。
 *
 * 軸の縁は軸と平行に長く続く。向きの違う短い線分(穴の縁・破れた紙)は、幅の中にあっても数えない。
 * 数えると、穴だらけの金・赤の帯の上で、刺さった点を越えて先まで軸が続いて見える
 */
function onLine(segments: Segments, origin: Vec, direction: Vec, width: number, maxLength: number): number[] {
  const [ox, oy] = origin;
  const [ux, uy] = direction;
  const minCos = Math.cos((SHAFT_ALIGN_DEGREES * Math.PI) / 180);
  const found: number[] = [];
  for (let i = 0; i < segments.length; i += 4) {
    const x1 = segments[i];
    const y1 = segments[i + 1];
    const x2 = segments[i + 2];
    const y2 = segments[i + 3];
    const t1 = (x1 - ox) * ux + (y1 - oy) * uy;
    const t2 = (x2 - ox) * ux + (y2 - oy) * uy;
    const o1 = Math.abs((x1 - ox) * uy - (y1 - oy) * ux);
    const o2 = Math.abs((x2 - ox) * uy - (y2 - oy) * ux);
    const length = Math.max(Math.hypot(x2 - x1, y2 - y1), 1e-9);
    // 線分の向きと直線の向きのなす角(向きの表裏は問わない)
    const aligned = Math.abs((x2 - x1) * ux + (y2 - y1) * uy) / length >= minCos;
    if (Math.max(o1, o2) <= width && Math.min(t1, t2) >= 0 && Math.max(t1, t2) <= maxLength && aligned) {
      found.push(i);
    }
  }
  return found;
}

/** 線分の端に当てた直線(線分の長さで重み付け)。向きは direction の側にそろえる */
function fitLine(segments: Segments, indices: number[], direction: Vec): [Vec, Vec] {
  let total = 0;
  let mx = 0;
  let my = 0;
  for (const i of indices) {
    const w = Math.hypot(segments[i + 2] - segments[i], segments[i + 3] - segments[i + 1]);
    total += 2 * w;
    mx += w * (segments[i] + segments[i + 2]);
    my += w * (segments[i + 1] + segments[i + 3]);
  }
  mx /= total;
  my /= total;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const i of indices) {
    const w = Math.hypot(segments[i + 2] - segments[i], segments[i + 3] - segments[i + 1]);
    for (const [x, y] of [
      [segments[i], segments[i + 1]],
      [segments[i + 2], segments[i + 3]],
    ]) {
      sxx += w * (x - mx) ** 2;
      sxy += w * (x - mx) * (y - my);
      syy += w * (y - my) ** 2;
    }
  }
  // 広がりのいちばん大きい向き
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  if (dx * direction[0] + dy * direction[1] < 0) {
    dx = -dx;
    dy = -dy;
  }
  return [
    [mx, my],
    [dx, dy],
  ];
}

/** 軸が線分で埋まっている割合。短い軸(ノックの直後で途切れた)は下げる */
function confidenceOf(length: number, covered: number, radius: number): number {
  return covered * Math.min(1, length / (radius * 0.3));
}

/** ノックの近く(軸の手前側)に羽根の色があれば、確からしさに足す */
function fletchBonus(hsv: HsvImage, nock: Vec, end: Vec, color: ArrowColor | null, radius: number): number {
  if (color === null) return 0;
  const [nx, ny] = nock;
  // 羽根はノックから軸に沿って少し先にある
  const cx = nx + (end[0] - nx) * 0.15;
  const cy = ny + (end[1] - ny) * 0.15;
  const half = Math.max(4, Math.round(radius * 0.06));
  const x0 = Math.max(0, Math.round(cx) - half);
  const y0 = Math.max(0, Math.round(cy) - half);
  const x1 = Math.min(hsv.width, Math.round(cx) + half);
  const y1 = Math.min(hsv.height, Math.round(cy) + half);
  if (x1 <= x0 || y1 <= y0) return 0;
  const ranges = COLOR_RANGES[color];
  let hit = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * hsv.width + x;
      if (
        ranges.some(
          ([low, high]) =>
            hsv.h[i] >= low[0] &&
            hsv.h[i] <= high[0] &&
            hsv.s[i] >= low[1] &&
            hsv.s[i] <= high[1] &&
            hsv.v[i] >= low[2] &&
            hsv.v[i] <= high[2],
        )
      ) {
        hit++;
      }
    }
  }
  return hit / ((x1 - x0) * (y1 - y0)) >= 0.12 ? 0.3 : -0.2;
}

/**
 * 確からしい順に並べ、先に選んだものとほぼ同じ所に刺さった推測(割れたノック・同じ軸に乗った
 * 別の塊からたどったもの)を除く。画面は先頭から本数だけ入れるので、同じ矢を二度数えないように
 */
export function distinctArrows(arrows: DetectedArrow[]): DetectedArrow[] {
  const kept: DetectedArrow[] = [];
  for (const arrow of [...arrows].sort((a, b) => b.confidence - a.confidence)) {
    if (kept.every((k) => Math.hypot(arrow.x - k.x, arrow.y - k.y) > DUPLICATE_DISTANCE)) kept.push(arrow);
  }
  return kept;
}

/**
 * たどれた軸の直線が集まる点(矢の向きの消失点)。(通る点, 向き, 重み) の直線から最小二乗で求める。
 * 軸がほぼ平行(消失点が遠い)・2 本に満たないときは null
 */
export function vanishingPoint(lines: Array<[Vec, Vec, number]>): Vec | null {
  if (lines.length < 2) return null;
  let a00 = 0;
  let a01 = 0;
  let a11 = 0;
  let b0 = 0;
  let b1 = 0;
  for (const [[px, py], [ux, uy], weight] of lines) {
    // 直線に垂直な成分だけを測る射影
    const p00 = 1 - ux * ux;
    const p01 = -ux * uy;
    const p11 = 1 - uy * uy;
    a00 += weight * p00;
    a01 += weight * p01;
    a11 += weight * p11;
    b0 += weight * (p00 * px + p01 * py);
    b1 += weight * (p01 * px + p11 * py);
  }
  const smallest = (a00 + a11) / 2 - Math.hypot((a00 - a11) / 2, a01);
  if (smallest < VANISHING_MIN_SPREAD * (a00 + a11)) return null;
  const det = a00 * a11 - a01 * a01;
  return [(a11 * b0 - a01 * b1) / det, (a00 * b1 - a01 * b0) / det];
}

function unit(start: Vec, end: Vec): Vec {
  const length = Math.max(Math.hypot(end[0] - start[0], end[1] - start[1]), 1e-9);
  return [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
}

/** 見つけた矢を、確からしい順に。nockColor は測ったノックの色(#rrggbb) */
export function detectArrows(
  hsv: HsvImage,
  segments: Segments,
  fit: TargetFit,
  nockColor: string | null,
  fletchColor: ArrowColor | null,
): DetectedArrow[] {
  const ranges = nockColor ? nockRanges(nockColor) : DEFAULT_NOCK_COLORS.flatMap((color) => COLOR_RANGES[color]);
  const nocks = findNocks(hsv, fit, ranges);
  const maxLength = fit.radius * MAX_SHAFT_LENGTH;
  const tolerance = Math.max(3, fit.radius * SHAFT_TOLERANCE);
  const center: Vec = [fit.centerX, fit.centerY];
  const toTarget = (point: Vec) => project(fit.homography, point[0], point[1]);
  const entersTarget = (point: Vec) => {
    const [x, y] = toTarget(point);
    return Math.hypot(x - 0.5, y - 0.5) <= MAX_ENTRY_DISTANCE;
  };

  const traced = nocks.map((nock) => traceShaft(nock, segments, maxLength, tolerance, center));
  // 写真の軸は、どれも矢の向きの消失点へ向かって伸びる。的の中心の近くのノックは、中心への向きが
  // 軸の向きと大きくずれてたどれないので、たどれた軸から求めた消失点へ向かってたどり直す
  const vanishing = vanishingPoint(
    nocks.flatMap((nock, i): Array<[Vec, Vec, number]> => {
      const result = traced[i];
      if (result === null || !entersTarget(result.end)) return [];
      return [[nock, unit(nock, result.end), confidenceOf(result.length, result.covered, fit.radius)]];
    }),
  );
  if (vanishing !== null) {
    nocks.forEach((nock, i) => {
      if (traced[i] !== null) return;
      if (Math.hypot(nock[0] - vanishing[0], nock[1] - vanishing[1]) <= fit.radius * VANISHING_NEAR) return;
      traced[i] = traceShaft(nock, segments, maxLength, tolerance, vanishing);
    });
  }
  const arrows: DetectedArrow[] = [];
  nocks.forEach((nock, i) => {
    const result = traced[i];
    if (result === null) return;
    const [x, y] = toTarget(result.end);
    if (Math.hypot(x - 0.5, y - 0.5) > MAX_ENTRY_DISTANCE) return;
    let confidence = confidenceOf(result.length, result.covered, fit.radius);
    confidence += fletchBonus(hsv, nock, result.end, fletchColor, fit.radius);
    arrows.push({ x, y, confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 1000) / 1000 });
  });
  return distinctArrows(arrows);
}
