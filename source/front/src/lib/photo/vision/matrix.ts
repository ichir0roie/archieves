/**
 * 写真の処理で使う、小さな行列の計算。3x3 は行の順に 9 個の数で持つ(lib/photo/alignment.ts の Homography と同じ形)。
 */

export type Mat3 = number[];
export type Vec3 = [number, number, number];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function multiplyAll(...matrices: Mat3[]): Mat3 {
  return matrices.reduce((product, m) => multiply(product, m));
}

export function transpose(m: Mat3): Mat3 {
  return [
    m[0],
    m[3],
    m[6],
    m[1],
    m[4],
    m[7],
    m[2],
    m[5],
    m[8],
  ];
}

export function determinant(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** 逆行列。特異なら null */
export function invert(m: Mat3): Mat3 | null {
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
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

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** 点を射影で写す */
export function project(m: Mat3, x: number, y: number): [number, number] {
  const [u, v, w] = apply(m, [x, y, 1]);
  return [u / w, v / w];
}

export function diagonal(a: number, b: number, c: number): Mat3 {
  return [
    a,
    0,
    0,
    0,
    b,
    0,
    0,
    0,
    c,
  ];
}

export function scale(m: Mat3, factor: number): Mat3 {
  return m.map((value) => value * factor);
}

/**
 * 3x3 の(対称とは限らない)行列の、実数の固有ベクトル(長さ 1)。複素数の固有値の分は返さない。
 * 特性多項式の実根ごとに、A - λI の行の外積で零空間を求める
 */
export function realEigenvectors(m: Mat3): Vec3[] {
  const trace = m[0] + m[4] + m[8];
  const minors =
    m[0] * m[4] - m[1] * m[3] + m[0] * m[8] - m[2] * m[6] + m[4] * m[8] - m[5] * m[7];
  const det = determinant(m);
  // λ^3 - trace λ^2 + minors λ - det = 0
  const roots = cubicRealRoots(-trace, minors, -det);
  const vectors: Vec3[] = [];
  for (const root of roots) {
    const rows: Vec3[] = [
      [m[0] - root, m[1], m[2]],
      [m[3], m[4] - root, m[5]],
      [m[6], m[7], m[8] - root],
    ];
    let best: Vec3 | null = null;
    let bestNorm = 0;
    for (let i = 0; i < 3; i++) {
      const v = cross(rows[i], rows[(i + 1) % 3]);
      const norm = Math.hypot(v[0], v[1], v[2]);
      if (norm > bestNorm) {
        best = v;
        bestNorm = norm;
      }
    }
    if (best === null || bestNorm === 0) continue;
    vectors.push([best[0] / bestNorm, best[1] / bestNorm, best[2] / bestNorm]);
  }
  return vectors;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** x^3 + a x^2 + b x + c = 0 の実根 */
function cubicRealRoots(a: number, b: number, c: number): number[] {
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const shift = -a / 3;
  const discriminant = (q * q) / 4 + (p * p * p) / 27;
  // 根が重なるときに誤差で複素数に振れないよう、判別式の 0 の近くは重根とみなす
  const tolerance = 1e-12 * Math.max(1, Math.abs((q * q) / 4), Math.abs((p * p * p) / 27));
  if (discriminant > tolerance) {
    const s = Math.sqrt(discriminant);
    return [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + shift];
  }
  if (Math.abs(p) < 1e-300) return [shift];
  if (discriminant >= -tolerance) {
    const u = Math.cbrt(-q / 2);
    return [2 * u + shift, -u + shift];
  }
  const r = 2 * Math.sqrt(-p / 3);
  const phi = Math.acos(Math.max(-1, Math.min(1, (3 * q) / (p * r))));
  return [0, 1, 2].map((k) => r * Math.cos((phi - 2 * Math.PI * k) / 3) + shift);
}

/**
 * 2x2 の対称行列 [[a, b], [b, c]] の固有値(小さい順)と、その固有ベクトル(列。numpy の eigh と同じ並び)
 */
export function symmetricEigen2(
  a: number,
  b: number,
  c: number,
): { values: [number, number]; vectors: [[number, number], [number, number]] } {
  const mean = (a + c) / 2;
  const radius = Math.hypot((a - c) / 2, b);
  const values: [number, number] = [mean - radius, mean + radius];
  // 大きい方の固有値の向き。b が 0 なら軸の向き
  let ux: number;
  let uy: number;
  if (Math.abs(b) > 1e-300) {
    ux = values[1] - c;
    uy = b;
  } else if (a >= c) {
    ux = 1;
    uy = 0;
  } else {
    ux = 0;
    uy = 1;
  }
  const norm = Math.hypot(ux, uy);
  ux /= norm;
  uy /= norm;
  // 列 0 が小さい方の固有ベクトル、列 1 が大きい方
  return {
    values,
    vectors: [
      [-uy, ux],
      [ux, uy],
    ],
  };
}

/** 4 組の対応で from を to へ写す射影(cv2.getPerspectiveTransform)。決まらなければ null */
export function perspectiveTransform(
  from: ReadonlyArray<[number, number]>,
  to: ReadonlyArray<[number, number]>,
): Mat3 | null {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-12) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = rows[row][col] / rows[col][col];
      for (let k = col; k < 9; k++) rows[row][k] -= factor * rows[col][k];
    }
  }
  return [...rows.map((row, i) => row[8] / rows[i][i]), 1];
}
