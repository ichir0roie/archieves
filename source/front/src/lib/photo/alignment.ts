/**
 * 写真の的を手で合わせる 4 点と、その 4 点から求める射影(ホモグラフィ)。
 *
 * 4 点は、赤の帯の外の線(7 点の外)の上・右・下・左。API の target_detection.ALIGNMENT_TARGET_POINTS と同じ。
 * 写真の上の位置は、向きを直した元の写真の幅・高さに対する割合で持つ(API の PhotoAlignmentWrite)。
 */

export type Point = [number, number];

/** 赤の帯の外の線の半径(的に対する割合。的の縁は 0.5) */
export const ALIGNMENT_RADIUS = 0.2;

/** 4 点の、的の上の位置(的に対する割合)。上・右・下・左 */
export const ALIGNMENT_TARGET_POINTS: ReadonlyArray<Point> = [
  [0.5, 0.5 - ALIGNMENT_RADIUS],
  [0.5 + ALIGNMENT_RADIUS, 0.5],
  [0.5, 0.5 + ALIGNMENT_RADIUS],
  [0.5 - ALIGNMENT_RADIUS, 0.5],
];

/** 3x3 の行列(行の順に 9 個) */
export type Homography = number[];

/**
 * 4 組の対応から、from を to へ写す射影を求める(h33 = 1 とした 8 元の連立方程式)。
 * 4 点がつぶれていて決まらなければ null
 */
export function solveHomography(from: ReadonlyArray<Point>, to: ReadonlyArray<Point>): Homography | null {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // 部分ピボットのガウスの消去法
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

export function applyHomography(h: Homography, [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** 上 → 右 → 下 → 左 が、画像の上で時計回りの凸な四角になっている(補正が決まる) */
export function isUsableAlignment(points: ReadonlyArray<Point>): boolean {
  return points.every((a, i) => {
    const b = points[(i + 1) % 4];
    const c = points[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 1e-6;
  });
}

/** 合わせたことのない写真の、最初の 4 点。写真の中央に、短い辺の 3 割の円の上・右・下・左を置く */
export function defaultAlignment(width: number, height: number): Array<Point> {
  const radius = Math.min(width, height) * 0.15;
  const rx = radius / width;
  const ry = radius / height;
  return [
    [0.5, 0.5 - ry],
    [0.5 + rx, 0.5],
    [0.5, 0.5 + ry],
    [0.5 - rx, 0.5],
  ];
}
