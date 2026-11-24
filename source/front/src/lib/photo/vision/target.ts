/**
 * 写真の中の的を見つけ、的を正面から見た形へ写すホモグラフィを求める。
 *
 * 1. 色の帯(金・赤・青)の塊を取る。畳は金と同じ色相なので、「丸く詰まっていて、
 *    まわりを赤が囲む」金の塊を的の中心として選ぶ(両隣の的が写っていても、画像の中央に近いもの)
 * 2. 金・金+赤・金+赤+青 の外形に楕円を当てはめる。矢・穴で欠けた所は凸包で埋める
 * 3. 同心円の像の性質で、斜めから撮った歪み(射影)を戻す。本当の中心の像は、二つの楕円の極線が
 *    同じになる点(一般化固有ベクトル)で、その極線が消失線になる。消失線を無限遠へ送ってから、
 *    外側の楕円を円にする
 * 4. 回転は決まらないので、画像の上が的の上になるよう回す
 *
 * 座標は、的に対する割合(左上が 0、中心が 0.5、的の縁までが 0.5)。入力の画面の矢の x・y と同じ。
 */

import { ALIGNMENT_RADIUS, ALIGNMENT_TARGET_POINTS, type Point } from "../alignment";
import {
  componentRowExtents,
  connectedComponents,
  closeEllipse,
  gaussianBlur5,
  rgbToHsv,
  type HsvImage,
  type Mask,
  type RgbImage,
} from "./image";
import { conicOf, ellipseHalfExtent, fitOuterEllipse, insideTest, type Ellipse } from "./ellipse";
import {
  apply,
  diagonal,
  invert,
  multiply,
  multiplyAll,
  perspectiveTransform,
  project,
  realEigenvectors,
  symmetricEigen2,
  transpose,
  type Mat3,
} from "./matrix";

type Ring = "yellow" | "red" | "blue";

/** 帯の外側の半径(的の半径に対する割合)。金の外は 9 点の外、赤の外は 7 点の外、青の外は 5 点の外 */
const RING_RADIUS: Record<Ring, number> = { yellow: 0.2, red: 0.4, blue: 0.6 };
/** 楕円の大きさの比の、受ける幅。外れた当てはめ(帯が矢・影で切れた)を捨てる */
const RING_RATIO_TOLERANCE: [number, number] = [0.75, 1.3];

export type TargetFit = {
  /** 画像の px を、的に対する割合へ写す 3x3 */
  homography: Mat3;
  /** 画像の上での、的の中心の像と的の半径のおよその px */
  centerX: number;
  centerY: number;
  radius: number;
};

/** 画像を factor 倍した(大きさを変えた)ときの的 */
export function scaleFit(fit: TargetFit, factor: number): TargetFit {
  return {
    homography: multiply(fit.homography, diagonal(1 / factor, 1 / factor, 1)),
    centerX: fit.centerX * factor,
    centerY: fit.centerY * factor,
    radius: fit.radius * factor,
  };
}

export function ringMasks(hsv: HsvImage): Record<Ring, Mask> {
  const { width, height, h, s, v } = hsv;
  const count = width * height;
  const yellow = new Uint8Array(count);
  const red = new Uint8Array(count);
  const blue = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const hue = h[i];
    const sat = s[i];
    const val = v[i];
    // 蛍光の緑のノックを金に入れないよう、金の色相は狭くする
    yellow[i] = hue >= 15 && hue <= 34 && sat >= 70 && val >= 90 ? 1 : 0;
    red[i] = (hue <= 8 || hue >= 165) && sat >= 80 && val >= 70 ? 1 : 0;
    blue[i] = hue >= 88 && hue <= 112 && sat >= 80 && val >= 70 ? 1 : 0;
  }
  return {
    yellow: { width, height, data: yellow },
    red: { width, height, data: red },
    blue: { width, height, data: blue },
  };
}

function or(...masks: Mask[]): Mask {
  const { width, height } = masks[0];
  const data = new Uint8Array(width * height);
  for (const mask of masks) {
    for (let i = 0; i < data.length; i++) data[i] |= mask.data[i];
  }
  return { width, height, data };
}

/** 金の塊。丸く詰まっていて、まわりを赤が囲むもの。いくつもあれば画像の中央に近い大きいもの */
function findGold(yellow: Mask, red: Mask): Mask | null {
  const { width, height } = yellow;
  const components = connectedComponents(yellow);
  let best: number | null = null;
  let bestScore = 0;
  for (let label = 1; label < components.count; label++) {
    const area = components.area[label];
    if (area < 300) continue;
    const ellipse = fitOuterEllipse(componentRowExtents(components, width, label));
    if (ellipse === null) continue;
    const { a, b } = ellipse;
    if (Math.min(a, b) < 5 || Math.max(a, b) / Math.min(a, b) > 3 || area / (Math.PI * a * b) < 0.5) continue;
    // 金の外に、金と同じくらいの幅の帯を取り、赤の割合を見る
    const outer = insideTest(ellipse, 2);
    const inner = insideTest(ellipse, 1.15);
    const [halfX, halfY] = ellipseHalfExtent(ellipse, 2);
    let band = 0;
    let redInBand = 0;
    const x0 = Math.max(0, Math.floor(ellipse.cx - halfX));
    const x1 = Math.min(width - 1, Math.ceil(ellipse.cx + halfX));
    const y0 = Math.max(0, Math.floor(ellipse.cy - halfY));
    const y1 = Math.min(height - 1, Math.ceil(ellipse.cy + halfY));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!outer(x, y) || inner(x, y)) continue;
        band++;
        redInBand += red.data[y * width + x];
      }
    }
    const redRatio = band > 0 ? redInBand / band : 0;
    if (redRatio < 0.3) continue;
    const distance = Math.hypot(components.centroidX[label] - width / 2, components.centroidY[label] - height / 2);
    const score = (redRatio * Math.sqrt(area)) / (1 + distance / Math.max(width, height));
    if (score > bestScore) {
      best = label;
      bestScore = score;
    }
  }
  if (best === null) return null;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = components.labels[i] === best ? 1 : 0;
  return { width, height, data };
}

/**
 * 同心円の像の、本当の中心の像。二つの円錐で極線が同じになる点(一般化固有ベクトル)のうち、
 * 楕円の中心に近いもの。見つからなければ楕円の中心
 */
function trueCenter(outer: Mat3, inner: Mat3, guess: Point): Point {
  const innerInverse = invert(inner);
  if (innerInverse === null) return guess;
  let best = guess;
  let bestDistance = Infinity;
  for (const vector of realEigenvectors(multiply(innerInverse, outer))) {
    // 無限遠の点は使わない
    if (Math.abs(vector[2]) <= 1e-12) continue;
    const point: Point = [vector[0] / vector[2], vector[1] / vector[2]];
    const distance = Math.hypot(point[0] - guess[0], point[1] - guess[1]);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function homographyFrom(ellipses: Partial<Record<Ring, Ellipse>>, size: number): { homography: Mat3; center: Point } {
  const outerKey: Ring = ellipses.blue ? "blue" : "red";
  const outerEllipse = ellipses[outerKey] as Ellipse;
  const outer = conicOf(outerEllipse);
  const guess: Point = [outerEllipse.cx, outerEllipse.cy];
  const centers = (["yellow", "red"] as const)
    .filter((key) => key !== outerKey && ellipses[key])
    .map((key) => trueCenter(outer, conicOf(ellipses[key] as Ellipse), guess));
  // 外れた中心(帯の当てはめが崩れた)は使わない
  const reach = 0.2 * 2 * Math.max(outerEllipse.a, outerEllipse.b);
  const near = centers.filter((c) => Math.hypot(c[0] - guess[0], c[1] - guess[1]) < reach);
  const center: Point = near.length
    ? [near.reduce((sum, c) => sum + c[0], 0) / near.length, near.reduce((sum, c) => sum + c[1], 0) / near.length]
    : guess;

  // 消失線(中心の極線)を無限遠へ送る。数値が安定するよう、画像の大きさで割ってから
  const normalize = diagonal(1 / size, 1 / size, 1);
  const normalizeInverse = diagonal(size, size, 1);
  const polar = apply(outer, [center[0], center[1], 1]);
  const line = apply(transpose(normalizeInverse), polar).map((value, _, all) => value / all[2]);
  const projective = multiply(
    [
      1,
      0,
      0,
      0,
      1,
      0,
      line[0],
      line[1],
      line[2],
    ],
    normalize,
  );
  const projectiveInverse = invert(projective) as Mat3;
  // 送ったあとの外側の楕円を、単位円にするアフィン
  const conic = multiplyAll(transpose(projectiveInverse), outer, projectiveInverse);
  const m00 = conic[0];
  const m01 = conic[1];
  const m11 = conic[4];
  const det = m00 * m11 - m01 * m01;
  const ex = -(m11 * conic[2] - m01 * conic[5]) / det;
  const ey = -(m00 * conic[5] - m01 * conic[2]) / det;
  const k = ex * (m00 * ex + m01 * ey) + ey * (m01 * ex + m11 * ey) - conic[8];
  const { values, vectors } = symmetricEigen2(m00 / k, m01 / k, m11 / k);
  // 鏡映にならないよう、固有ベクトルの向きをそろえる(行列式を正に)
  const sign = Math.sign(vectors[0][0] * vectors[1][1] - vectors[0][1] * vectors[1][0]) || 1;
  const v0: Point = [vectors[0][0], vectors[1][0]];
  const v1: Point = [vectors[0][1] * sign, vectors[1][1] * sign];
  const s0 = Math.sqrt(values[0]);
  const s1 = Math.sqrt(values[1]);
  // linear = diag(sqrt(values)) @ vectorsᵀ
  const l00 = s0 * v0[0];
  const l01 = s0 * v0[1];
  const l10 = s1 * v1[0];
  const l11 = s1 * v1[1];
  const affine: Mat3 = [
    l00,
    l01,
    -(l00 * ex + l01 * ey),
    l10,
    l11,
    -(l10 * ex + l11 * ey),
    0,
    0,
    1,
  ];
  // 外側の帯の半径に合わせ、中心を 0.5 に置く
  const r = RING_RADIUS[outerKey] / 2;
  const homography = multiplyAll(
    [
      r,
      0,
      0.5,
      0,
      r,
      0.5,
      0,
      0,
      1,
    ],
    affine,
    projective,
  );

  // 画像で中心の真上の点が、的でも真上に来るよう回す
  const middle = project(homography, center[0], center[1]);
  const above = project(homography, center[0], center[1] - size * 0.05);
  const angle = Math.atan2(above[0] - middle[0], middle[1] - above[1]);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotate: Mat3 = [
    c,
    s,
    0.5 - 0.5 * c - 0.5 * s,
    -s,
    c,
    0.5 + 0.5 * s - 0.5 * c,
    0,
    0,
    1,
  ];
  return { homography: multiply(rotate, homography), center };
}

/** 画像の中の的。見つからなければ null */
export function findTarget(image: RgbImage): TargetFit | null {
  const { width, height } = image;
  const masks = ringMasks(rgbToHsv(gaussianBlur5(image)));
  // 矢・穴で切れた帯をつなぐ幅
  const gap = Math.max(9, Math.floor(Math.max(height, width) / 60));
  const gold = findGold(closeEllipse(masks.yellow, gap), masks.red);
  if (gold === null) return null;
  // 帯ごとに、金の塊と重なる塊を選ぶ(畳の黄は使わない)
  const regions: Record<Ring, Mask> = {
    yellow: gold,
    red: or(gold, masks.red),
    blue: or(gold, masks.red, masks.blue),
  };
  const ellipses: Partial<Record<Ring, Ellipse>> = {};
  for (const key of ["yellow", "red", "blue"] as const) {
    const components = connectedComponents(closeEllipse(regions[key], gap));
    const overlap = new Int32Array(components.count);
    for (let i = 0; i < gold.data.length; i++) {
      if (gold.data[i]) overlap[components.labels[i]]++;
    }
    let label = 0;
    for (let l = 1; l < components.count; l++) if (overlap[l] > overlap[label]) label = l;
    const ellipse = fitOuterEllipse(componentRowExtents(components, width, label));
    if (ellipse) ellipses[key] = ellipse;
  }
  if (!ellipses.yellow) return null;
  // 帯の大きさの比で、当てはめの外れを捨てる(赤の外は金の外の 2 倍、青の外は 3 倍)
  const sizeOf = (e: Ellipse) => e.a + e.b;
  const goldSize = sizeOf(ellipses.yellow);
  const [low, high] = RING_RATIO_TOLERANCE;
  for (const key of ["red", "blue"] as const) {
    const ellipse = ellipses[key];
    if (!ellipse) continue;
    const expected = RING_RADIUS[key] / RING_RADIUS.yellow;
    const ratio = sizeOf(ellipse) / goldSize;
    if (!(expected * low < ratio && ratio < expected * high)) delete ellipses[key];
  }
  if (!ellipses.red && !ellipses.blue) return null;
  const { homography, center } = homographyFrom(ellipses, Math.max(height, width));
  const outerKey: Ring = ellipses.blue ? "blue" : "red";
  const outer = ellipses[outerKey] as Ellipse;
  return {
    homography,
    centerX: center[0],
    centerY: center[1],
    radius: (outer.a + outer.b) / 2 / RING_RADIUS[outerKey],
  };
}

/** 人が合わせた 4 点(画像の px。ALIGNMENT_TARGET_POINTS の順)からの的。決まらなければ null */
export function fitFromPoints(points: ReadonlyArray<Point>): TargetFit | null {
  const homography = perspectiveTransform(points, ALIGNMENT_TARGET_POINTS);
  const inverse = homography && invert(homography);
  if (!homography || !inverse) return null;
  const [centerX, centerY] = project(inverse, 0.5, 0.5);
  // 4 点は的の半径の 4 割の所にある
  const spread = points.reduce((sum, [x, y]) => sum + Math.hypot(x - centerX, y - centerY), 0) / points.length;
  return { homography, centerX, centerY, radius: spread / (ALIGNMENT_RADIUS * 2) };
}

/** 的を写す行列から、合わせる 4 点の画像の上の位置(画像の幅・高さに対する割合) */
export function alignmentPointsOf(homography: Mat3, width: number, height: number): Point[] | null {
  const inverse = invert(homography);
  if (!inverse) return null;
  return ALIGNMENT_TARGET_POINTS.map(([x, y]) => {
    const [px, py] = project(inverse, x, y);
    return [px / width, py / height];
  });
}
