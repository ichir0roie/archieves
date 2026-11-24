/**
 * 塗った領域の外形への楕円の当てはめ(API で使っていた cv2.convexHull と cv2.fitEllipse の代わり)。
 */

import { realEigenvectors, symmetricEigen2, type Mat3 } from "./matrix";

/** 楕円。a は angle(ラジアン)の向きの半径、b はそれと直交する向きの半径 */
export type Ellipse = { cx: number; cy: number; a: number; b: number; angle: number };

/** 凸包(Andrew の方法)。頂点を一周の順に */
export function convexHull(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * 領域の外形の点(行ごとの左右の端など)の凸包に、楕円を当てはめる。矢・穴で欠けた所は凸包で埋まる。
 * 凸包の頂点はまばらなので、辺に沿って 3px おきに点を足してから当てはめる。当てはまらなければ null
 */
export function fitOuterEllipse(points: ReadonlyArray<[number, number]>): Ellipse | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const dense: Array<[number, number]> = [];
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const steps = Math.max(Math.floor(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3), 1);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      dense.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return fitEllipse(dense);
}

/**
 * 点に楕円を当てはめる(Fitzgibbon の直接の最小二乗を、Halir と Flusser の数値に強い形で)。
 * 数値が安定するよう、点の重心を原点に、広がりを 1 くらいにしてから解く
 */
export function fitEllipse(points: ReadonlyArray<[number, number]>): Ellipse | null {
  const n = points.length;
  if (n < 5) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let spread = 0;
  for (const [x, y] of points) spread += (x - mx) ** 2 + (y - my) ** 2;
  const s = Math.sqrt(spread / n / 2) || 1;

  // S1 = D1ᵀD1, S2 = D1ᵀD2, S3 = D2ᵀD2(D1 = [x², xy, y²], D2 = [x, y, 1])
  const s1 = new Array<number>(9).fill(0);
  const s2 = new Array<number>(9).fill(0);
  const s3 = new Array<number>(9).fill(0);
  for (const [px, py] of points) {
    const x = (px - mx) / s;
    const y = (py - my) / s;
    const d1 = [x * x, x * y, y * y];
    const d2 = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        s1[i * 3 + j] += d1[i] * d1[j];
        s2[i * 3 + j] += d1[i] * d2[j];
        s3[i * 3 + j] += d2[i] * d2[j];
      }
    }
  }
  const s3Inverse = invert3(s3);
  if (s3Inverse === null) return null;
  // T = -S3⁻¹ S2ᵀ、M = S1 + S2 T
  const t = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += s3Inverse[i * 3 + k] * s2[j * 3 + k];
      t[i * 3 + j] = -sum;
    }
  }
  const m = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = s1[i * 3 + j];
      for (let k = 0; k < 3; k++) sum += s2[i * 3 + k] * t[k * 3 + j];
      m[i * 3 + j] = sum;
    }
  }
  // 楕円の拘束 4ac - b² = 1 の行列の逆を掛ける
  const reduced = [
    m[6] / 2,
    m[7] / 2,
    m[8] / 2,
    -m[3],
    -m[4],
    -m[5],
    m[0] / 2,
    m[1] / 2,
    m[2] / 2,
  ];
  const quadratic = realEigenvectors(reduced).find(([a, b, c]) => 4 * a * c - b * b > 0);
  if (!quadratic) return null;
  const linear = [0, 1, 2].map(
    (i) => t[i * 3] * quadratic[0] + t[i * 3 + 1] * quadratic[1] + t[i * 3 + 2] * quadratic[2],
  );
  const [A, B, C] = quadratic;
  const [D, E, F] = linear;
  // 正規化した座標の円錐を、元の座標へ戻す(x' = (x - m) / s)
  const normalized: Mat3 = [
    A,
    B / 2,
    D / 2,
    B / 2,
    C,
    E / 2,
    D / 2,
    E / 2,
    F,
  ];
  const back: Mat3 = [
    1 / s,
    0,
    -mx / s,
    0,
    1 / s,
    -my / s,
    0,
    0,
    1,
  ];
  return ellipseFromConic(congruent(normalized, back));
}

/** Nᵀ Q N */
function congruent(q: Mat3, n: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        for (let l = 0; l < 3; l++) sum += n[k * 3 + i] * q[k * 3 + l] * n[l * 3 + j];
      }
      out[i * 3 + j] = sum;
    }
  }
  return out;
}

function invert3(m: number[]): number[] | null {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-300) return null;
  return [
    (m[4] * m[8] - m[5] * m[7]) / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
}

/** 円錐(楕円)の 3x3 から、中心・半径・向き。楕円でなければ null */
function ellipseFromConic(q: Mat3): Ellipse | null {
  const a = q[0];
  const b = q[1];
  const c = q[4];
  const det = a * c - b * b;
  if (!(det > 0)) return null;
  const cx = (b * q[5] - c * q[2]) / det;
  const cy = (b * q[2] - a * q[5]) / det;
  // 中心での値。楕円は (x - c)ᵀ M (x - c) = -value
  const value = q[8] + q[2] * cx + q[5] * cy;
  if (!(value * a < 0)) return null;
  const { values, vectors } = symmetricEigen2(a / -value, b / -value, c / -value);
  if (!(values[0] > 0)) return null;
  // 小さい固有値の向きが長い半径
  return {
    cx,
    cy,
    a: 1 / Math.sqrt(values[0]),
    b: 1 / Math.sqrt(values[1]),
    angle: Math.atan2(vectors[1][0], vectors[0][0]),
  };
}

/** 楕円の 3x3 の円錐行列(点 x で xᵀ C x = 0)。factor 倍に広げた楕円にもできる */
export function conicOf(ellipse: Ellipse, factor = 1): Mat3 {
  const [m00, m01, m11] = shapeOf(ellipse, factor);
  const { cx, cy } = ellipse;
  const mcx = m00 * cx + m01 * cy;
  const mcy = m01 * cx + m11 * cy;
  return [
    m00,
    m01,
    -mcx,
    m01,
    m11,
    -mcy,
    -mcx,
    -mcy,
    cx * mcx + cy * mcy - 1,
  ];
}

/** (x - c)ᵀ M (x - c) <= 1 が中の M([m00, m01, m11]) */
function shapeOf(ellipse: Ellipse, factor: number): [number, number, number] {
  const cos = Math.cos(ellipse.angle);
  const sin = Math.sin(ellipse.angle);
  const ia = 1 / (ellipse.a * factor) ** 2;
  const ib = 1 / (ellipse.b * factor) ** 2;
  return [cos * cos * ia + sin * sin * ib, cos * sin * (ia - ib), sin * sin * ia + cos * cos * ib];
}

/** 楕円を factor 倍に広げたものの中にあるか、を画素ごとに確かめる関数 */
export function insideTest(ellipse: Ellipse, factor: number): (x: number, y: number) => boolean {
  const [m00, m01, m11] = shapeOf(ellipse, factor);
  return (x, y) => {
    const dx = x - ellipse.cx;
    const dy = y - ellipse.cy;
    return m00 * dx * dx + 2 * m01 * dx * dy + m11 * dy * dy <= 1;
  };
}

/** 楕円の、外接する軸に平行な四角の半分の幅・高さ */
export function ellipseHalfExtent(ellipse: Ellipse, factor = 1): [number, number] {
  const a = ellipse.a * factor;
  const b = ellipse.b * factor;
  const cos = Math.cos(ellipse.angle);
  const sin = Math.sin(ellipse.angle);
  return [Math.hypot(a * cos, b * sin), Math.hypot(a * sin, b * cos)];
}
