/**
 * 写真の処理で使う、画素の処理。OpenCV の同じ名前の処理(API で使っていたもの)に合わせる。
 *
 * - 色の画像は RGB の 3 チャンネル、行の順(OpenCV の BGR とは並びが逆)
 * - 塗った領域(マスク)は 1 チャンネルで、0 か 1(OpenCV の 0 / 255 の代わり)
 */

import { invert, type Mat3 } from "./matrix";

export type RgbImage = { width: number; height: number; data: Uint8Array };
export type Mask = { width: number; height: number; data: Uint8Array };

/** HSV は OpenCV の 8 ビットと同じ幅(色相 0〜180、彩度・明度 0〜255)。チャンネルを分けて持つ */
export type HsvImage = {
  width: number;
  height: number;
  h: Uint8Array;
  s: Uint8Array;
  v: Uint8Array;
};

const HSV_SHIFT = 12;
const HSV_ROUND = 1 << (HSV_SHIFT - 1);
// OpenCV の RGB2HSV_b と同じ、割り算の表
const SATURATION_DIVISORS = Int32Array.from({ length: 256 }, (_, i) =>
  i === 0 ? 0 : Math.round((255 << HSV_SHIFT) / i),
);
const HUE_DIVISORS = Int32Array.from({ length: 256 }, (_, i) =>
  i === 0 ? 0 : Math.round((180 << HSV_SHIFT) / (6 * i)),
);

export function rgbToHsv(image: RgbImage): HsvImage {
  const count = image.width * image.height;
  const h = new Uint8Array(count);
  const s = new Uint8Array(count);
  const v = new Uint8Array(count);
  const data = image.data;
  for (let i = 0, p = 0; i < count; i++, p += 3) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = Math.max(r, g, b);
    const diff = max - Math.min(r, g, b);
    let hue: number;
    if (max === r) hue = g - b;
    else if (max === g) hue = b - r + 2 * diff;
    else hue = r - g + 4 * diff;
    hue = (hue * HUE_DIVISORS[diff] + HSV_ROUND) >> HSV_SHIFT;
    if (hue < 0) hue += 180;
    h[i] = hue;
    s[i] = (diff * SATURATION_DIVISORS[max] + HSV_ROUND) >> HSV_SHIFT;
    v[i] = max;
  }
  return { width: image.width, height: image.height, h, s, v };
}

/** 灰色(OpenCV の BGR2GRAY と同じ重みと丸め) */
export function rgbToGray(image: RgbImage): Uint8Array {
  const count = image.width * image.height;
  const gray = new Uint8Array(count);
  const data = image.data;
  for (let i = 0, p = 0; i < count; i++, p += 3) {
    gray[i] = (data[p] * 9798 + data[p + 1] * 19235 + data[p + 2] * 3735 + 16384) >> 15;
  }
  return gray;
}

/** 5x5 のガウスぼかし(cv2.GaussianBlur(image, (5, 5), 0))。端は BORDER_REFLECT_101 */
export function gaussianBlur5(image: RgbImage): RgbImage {
  const { width, height, data } = image;
  const kernel = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  const reflect = (i: number, n: number) => {
    if (n === 1) return 0;
    while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
    return i;
  };
  const rows = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) sum += kernel[k + 2] * data[(y * width + reflect(x + k, width)) * 3 + c];
        rows[(y * width + x) * 3 + c] = sum;
      }
    }
  }
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) sum += kernel[k + 2] * rows[(reflect(y + k, height) * width + x) * 3 + c];
        out[(y * width + x) * 3 + c] = Math.round(sum);
      }
    }
  }
  return { width, height, data: out };
}

/** 一つの軸の、面積で平均して縮めるときの重み(出力の画素ごとに、入力の画素と重みの組) */
function areaWeights(source: number, target: number): Array<Array<[number, number]>> {
  const ratio = source / target;
  return Array.from({ length: target }, (_, i) => {
    const start = i * ratio;
    const end = Math.min((i + 1) * ratio, source);
    const weights: Array<[number, number]> = [];
    for (let j = Math.floor(start); j < end; j++) {
      const overlap = Math.min(end, j + 1) - Math.max(start, j);
      if (overlap > 1e-9) weights.push([j, overlap / (end - start)]);
    }
    return weights;
  });
}

/** 面積で平均して縮める(cv2.resize の INTER_AREA)。factor は 1 以下 */
export function resizeArea(image: RgbImage, factor: number): RgbImage {
  const width = Math.max(1, Math.round(image.width * factor));
  const height = Math.max(1, Math.round(image.height * factor));
  const xs = areaWeights(image.width, width);
  const ys = areaWeights(image.height, height);
  const rows = new Float32Array(width * image.height * 3);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [j, w] of xs[x]) {
        const p = (y * image.width + j) * 3;
        r += image.data[p] * w;
        g += image.data[p + 1] * w;
        b += image.data[p + 2] * w;
      }
      const q = (y * width + x) * 3;
      rows[q] = r;
      rows[q + 1] = g;
      rows[q + 2] = b;
    }
  }
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [j, w] of ys[y]) {
        const p = (j * width + x) * 3;
        r += rows[p] * w;
        g += rows[p + 1] * w;
        b += rows[p + 2] * w;
      }
      const q = (y * width + x) * 3;
      out[q] = Math.round(r);
      out[q + 1] = Math.round(g);
      out[q + 2] = Math.round(b);
    }
  }
  return { width, height, data: out };
}

/**
 * 射影で写した画像(cv2.warpPerspective、双線形の補間)。m は入力の px → 出力の px。
 * 入力の外は黒。出力は RGBA(そのまま ImageData にする)
 */
export function warpPerspectiveRgba(image: RgbImage, m: Mat3, width: number, height: number): Uint8ClampedArray {
  const inverse = invert(m);
  const out = new Uint8ClampedArray(width * height * 4);
  if (inverse === null) return out;
  const { width: sw, height: sh, data } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = inverse[6] * x + inverse[7] * y + inverse[8];
      const sx = (inverse[0] * x + inverse[1] * y + inverse[2]) / w;
      const sy = (inverse[3] * x + inverse[4] * y + inverse[5]) / w;
      const q = (y * width + x) * 4;
      out[q + 3] = 255;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (!(x0 >= -1 && y0 >= -1 && x0 < sw && y0 < sh)) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      // 入力の外の画素は黒として混ぜる(BORDER_CONSTANT)。外なら重みを 0 にする
      const inLeft = x0 >= 0;
      const inRight = x0 + 1 < sw;
      const inTop = y0 >= 0;
      const inBottom = y0 + 1 < sh;
      const w00 = inLeft && inTop ? (1 - fx) * (1 - fy) : 0;
      const w10 = inRight && inTop ? fx * (1 - fy) : 0;
      const w01 = inLeft && inBottom ? (1 - fx) * fy : 0;
      const w11 = inRight && inBottom ? fx * fy : 0;
      const p00 = ((inTop ? y0 : 0) * sw + (inLeft ? x0 : 0)) * 3;
      const p10 = ((inTop ? y0 : 0) * sw + (inRight ? x0 + 1 : 0)) * 3;
      const p01 = ((inBottom ? y0 + 1 : 0) * sw + (inLeft ? x0 : 0)) * 3;
      const p11 = ((inBottom ? y0 + 1 : 0) * sw + (inRight ? x0 + 1 : 0)) * 3;
      for (let c = 0; c < 3; c++) {
        out[q + c] = Math.round(
          data[p00 + c] * w00 + data[p10 + c] * w10 + data[p01 + c] * w01 + data[p11 + c] * w11,
        );
      }
    }
  }
  return out;
}

/** cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)) の、行ごとの半幅(中心の列から) */
function ellipseKernelRows(size: number): number[] {
  const r = Math.floor(size / 2);
  const inverseR2 = r > 0 ? 1 / (r * r) : 0;
  return Array.from({ length: size }, (_, i) => {
    const dy = i - r;
    if (Math.abs(dy) > r) return -1;
    return Math.round(r * Math.sqrt((r * r - dy * dy) * inverseR2));
  });
}

/** 行ごとの、塗った画素の数の累積(幅 + 1 ずつ) */
function rowPrefix(mask: Mask): Int32Array {
  const { width, height, data } = mask;
  const prefix = new Int32Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * (width + 1);
    for (let x = 0; x < width; x++) {
      sum += data[y * width + x];
      prefix[base + x + 1] = sum;
    }
  }
  return prefix;
}

/**
 * 楕円の形の膨張(dilate)・収縮(erode)。行ごとの窓に塗った画素があるか(すべて塗られているか)を、
 * 行の累積で数える。画像の外は、膨張では塗っていない・収縮では塗っているものとする(OpenCV の既定)
 */
function morph(mask: Mask, size: number, dilate: boolean): Mask {
  const { width, height } = mask;
  const rows = ellipseKernelRows(size);
  const center = Math.floor(size / 2);
  const prefix = rowPrefix(mask);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = !dilate;
      for (let i = 0; i < size; i++) {
        const half = rows[i];
        if (half < 0) continue;
        const sy = y + i - center;
        const x0 = x - half;
        const x1 = x + half;
        if (sy < 0 || sy >= height) continue;
        const cx0 = Math.max(0, x0);
        const cx1 = Math.min(width - 1, x1);
        const count = prefix[sy * (width + 1) + cx1 + 1] - prefix[sy * (width + 1) + cx0];
        if (dilate ? count > 0 : count < cx1 - cx0 + 1) {
          hit = dilate;
          break;
        }
      }
      out[y * width + x] = hit ? 1 : 0;
    }
  }
  return { width, height, data: out };
}

/** 楕円の形での閉じ(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, 楕円の size)) */
export function closeEllipse(mask: Mask, size: number): Mask {
  return morph(morph(mask, size, true), size, false);
}

/**
 * 2x2 の開き(小さな点を消す)。cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2))) と同じく、
 * 収縮も膨張も左上の画素を見るので、残る塊は右下へ 1px ずれる(数字を決めたときの癖に合わせる)
 */
export function open2x2(mask: Mask): Mask {
  const { width, height, data } = mask;
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      eroded[i] =
        data[i] && x > 0 && y > 0 && data[i - 1] && data[i - width] && data[i - width - 1] ? 1 : 0;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      out[i] =
        eroded[i] ||
        (x > 0 && eroded[i - 1]) ||
        (y > 0 && eroded[i - width]) ||
        (x > 0 && y > 0 && eroded[i - width - 1])
          ? 1
          : 0;
    }
  }
  return { width, height, data: out };
}

export type Components = {
  /** 塊の数(背景の 0 を含む) */
  count: number;
  /** 画素ごとの塊の番号。0 は背景 */
  labels: Int32Array;
  area: Int32Array;
  centroidX: Float64Array;
  centroidY: Float64Array;
  /** 塊を囲む四角(含む端) */
  left: Int32Array;
  top: Int32Array;
  right: Int32Array;
  bottom: Int32Array;
};

/** 8 近傍でつながった塊(cv2.connectedComponentsWithStats)。番号は、画像を行の順に読んで出会った順 */
export function connectedComponents(mask: Mask): Components {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const parent: number[] = [0];
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!data[i]) continue;
      let label = 0;
      const neighbors = [
        x > 0 ? labels[i - 1] : 0,
        y > 0 && x > 0 ? labels[i - width - 1] : 0,
        y > 0 ? labels[i - width] : 0,
        y > 0 && x + 1 < width ? labels[i - width + 1] : 0,
      ];
      for (const n of neighbors) {
        if (n === 0) continue;
        if (label === 0) label = n;
        else if (n !== label) union(label, n);
      }
      if (label === 0) {
        label = parent.length;
        parent.push(label);
      }
      labels[i] = label;
    }
  }
  // 根の番号を、出会った順の 1, 2, ... に付け直す
  const renumber = new Int32Array(parent.length);
  let count = 1;
  for (let i = 1; i < parent.length; i++) {
    const root = find(i);
    if (root === i) renumber[i] = count++;
  }
  for (let i = 1; i < parent.length; i++) renumber[i] = renumber[find(i)];
  const area = new Int32Array(count);
  const sumX = new Float64Array(count);
  const sumY = new Float64Array(count);
  const left = new Int32Array(count).fill(width);
  const top = new Int32Array(count).fill(height);
  const right = new Int32Array(count).fill(-1);
  const bottom = new Int32Array(count).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const label = renumber[labels[i]];
      labels[i] = label;
      if (label === 0) continue;
      area[label]++;
      sumX[label] += x;
      sumY[label] += y;
      if (x < left[label]) left[label] = x;
      if (x > right[label]) right[label] = x;
      if (y < top[label]) top[label] = y;
      if (y > bottom[label]) bottom[label] = y;
    }
  }
  const centroidX = new Float64Array(count);
  const centroidY = new Float64Array(count);
  for (let label = 1; label < count; label++) {
    centroidX[label] = sumX[label] / area[label];
    centroidY[label] = sumY[label] / area[label];
  }
  return { count, labels, area, centroidX, centroidY, left, top, right, bottom };
}

/** 塊 label の、行ごとの左右の端の画素(凸包を取るのに足りる点) */
export function componentRowExtents(components: Components, width: number, label: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let y = components.top[label]; y <= components.bottom[label]; y++) {
    let first = -1;
    let last = -1;
    for (let x = components.left[label]; x <= components.right[label]; x++) {
      if (components.labels[y * width + x] !== label) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    points.push([first, y]);
    if (last !== first) points.push([last, y]);
  }
  return points;
}
