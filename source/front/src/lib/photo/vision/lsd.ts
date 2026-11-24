/**
 * 線分の検出(LSD: Line Segment Detector)。OpenCV の modules/imgproc/src/lsd.cpp を移したもの。
 *
 * OpenCV と同じ線分を返すことを目指し、途中の計算も OpenCV に合わせている。
 * - ぼかし(GaussianBlur)と縮小(resize の INTER_LINEAR_EXACT)は、OpenCV の 8 ビットの固定小数点の
 *   計算(ビット単位で同じ結果になる)をそのまま整数でなぞる
 * - 勾配の向きは cv::fastAtan2(float の多項式近似)を Math.fround でなぞる。向きのわずかな違いでも
 *   領域の伸び方が変わるため
 * - 領域の種の順(勾配の強さのビンの降順、同じビンの中は行の順)も OpenCV の stable_sort と同じにする
 * LSD_REFINE_STD では NFA を計算しない(OpenCV の実装がそうなっている)ので、log_eps は使わない。
 */

const SCALE = 0.8;
const SIGMA_SCALE = 0.6;
const QUANT = 2.0;
const ANG_TH = 22.5;
const DENSITY_TH = 0.7;
const N_BINS = 1024;

const DEG_TO_RADS = Math.PI / 180;
const M_3_2_PI = (3 * Math.PI) / 2;
const M_2__PI = 2 * Math.PI;
// 勾配の向きが決まらない画素の印。fastAtan2 は 0〜360 度を返すので重ならない
const NOTDEF = -1024;

const f32 = Math.fround;
const ATAN2_P1 = f32(f32(0.9997878412794807) * f32(180 / Math.PI));
const ATAN2_P3 = f32(f32(-0.3258083974640975) * f32(180 / Math.PI));
const ATAN2_P5 = f32(f32(0.1555786518463281) * f32(180 / Math.PI));
const ATAN2_P7 = f32(f32(-0.04432655554792128) * f32(180 / Math.PI));
const FLT_DBL_EPSILON = f32(2.220446049250313e-16);

/**
 * cv::fastAtan2(度、0〜360)。y・x は float の値で渡す。
 * float の四則演算は、double で計算して float に丸めれば float で計算したのと同じ値になる
 */
function fastAtan2(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a: number;
  if (ax >= ay) {
    const c = f32(ay / f32(ax + FLT_DBL_EPSILON));
    const c2 = f32(c * c);
    a = f32(f32(f32(f32(f32(f32(f32(ATAN2_P7 * c2) + ATAN2_P5) * c2) + ATAN2_P3) * c2) + ATAN2_P1) * c);
  } else {
    const c = f32(ax / f32(ay + FLT_DBL_EPSILON));
    const c2 = f32(c * c);
    a = f32(90 - f32(f32(f32(f32(f32(f32(f32(ATAN2_P7 * c2) + ATAN2_P5) * c2) + ATAN2_P3) * c2) + ATAN2_P1) * c));
  }
  if (x < 0) a = f32(180 - a);
  if (y < 0) a = f32(360 - a);
  return a;
}

function angleDiffSigned(a: number, b: number): number {
  let diff = a - b;
  while (diff <= -Math.PI) diff += M_2__PI;
  while (diff > Math.PI) diff -= M_2__PI;
  return diff;
}

/** BORDER_REFLECT_101(OpenCV の既定の縁の扱い) */
function reflect101(p: number, len: number): number {
  if (len === 1) return 0;
  while (p < 0 || p >= len) {
    p = p < 0 ? -p : 2 * len - p - 2;
  }
  return p;
}

/**
 * GaussianBlur が 8 ビットの画像に使う固定小数点のカーネル(和が 256)。
 * OpenCV の getGaussianKernelBitExact と getGaussianKernelFixedPoint_ED(誤差拡散で丸める)をなぞる
 */
function gaussianKernelFixed(n: number, sigma: number): Int32Array {
  const scale2X = -0.125 / (sigma * sigma);
  const half = (n - 1) / 2;
  const values = new Float64Array(half);
  let sum = 0;
  for (let i = 0, x = 1 - n; i < half; i++, x += 2) {
    values[i] = Math.exp(x * x * scale2X);
    sum += values[i];
  }
  sum = sum * 2 + 1;
  const mul = 1 / sum;
  const result = new Int32Array(n);
  let err = 0;
  let total = 0;
  for (let i = 0; i < half; i++) {
    const adj = values[i] * mul * 256 + err;
    // cvRound は偶数への丸め
    let v = Math.round(adj);
    if (Math.abs(adj % 1) === 0.5 && v % 2 !== 0) v -= 1;
    err = adj - v;
    result[i] = v;
    result[n - 1 - i] = v;
    total += v;
  }
  result[half] = 256 - total * 2;
  return result;
}

/** cv::GaussianBlur(8 ビットの画像に使う固定小数点の実装と同じ結果) */
function gaussianBlur(src: Uint8Array, width: number, height: number, ksize: number, sigma: number): Uint8Array {
  const k = gaussianKernelFixed(ksize, sigma);
  const r = (ksize - 1) / 2;
  const dst = new Uint8Array(width * height);
  // 横にぼかした行(小数部 8 ビット)。縦に使う ksize 行だけを、行の番号 % ksize の所に持つ
  const rows = new Uint32Array(ksize * width);
  const ready = new Int32Array(ksize).fill(-1);
  const colIndex = new Int32Array(width + 2 * r);
  for (let x = -r; x < width + r; x++) colIndex[x + r] = reflect101(x, width);

  const hline = (y: number) => {
    const slot = y % ksize;
    if (ready[slot] === y) return;
    ready[slot] = y;
    const base = slot * width;
    const srow = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let j = 0; j < ksize; j++) {
        const w = k[j];
        if (w !== 0) acc += w * src[srow + colIndex[x + j]];
      }
      rows[base + x] = acc;
    }
  };

  const rowSlots = new Int32Array(ksize);
  for (let y = 0; y < height; y++) {
    for (let j = 0; j < ksize; j++) {
      const sy = reflect101(y + j - r, height);
      hline(sy);
      rowSlots[j] = (sy % ksize) * width;
    }
    const drow = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let j = 0; j < ksize; j++) {
        const w = k[j];
        if (w !== 0) acc += w * rows[rowSlots[j] + x];
      }
      // 小数部 16 ビットを四捨五入して 8 ビットへ
      dst[drow + x] = Math.min(255, (acc + 32768) >>> 16);
    }
  }
  return dst;
}

/**
 * cv::resize(INTER_LINEAR_EXACT)で fx = fy = scale に縮める。
 * 係数は小数部 8 ビットの固定小数点。scale = 0.8 なら係数は 1/8 刻みで、丸めの誤差は出ない
 */
function resizeLinearExact(
  src: Uint8Array,
  width: number,
  height: number,
  dstWidth: number,
  dstHeight: number,
  scale: number,
): Uint8Array {
  const inv = 1 / scale;
  const coeffs = (dstLen: number, srcLen: number) => {
    const ofs = new Int32Array(dstLen);
    const c1 = new Int32Array(dstLen);
    // 元の画像の端より外へ出た所(係数を使わず端の画素をそのまま使う)
    const clamped = new Uint8Array(dstLen);
    for (let d = 0; d < dstLen; d++) {
      const fval = inv * (d + 0.5) - 0.5;
      let ival = Math.floor(fval);
      if (ival < 0) {
        ival = 0;
        clamped[d] = 1;
      } else if (ival >= srcLen - 1 || srcLen <= 1) {
        ival = srcLen - 1;
        clamped[d] = 1;
      }
      ofs[d] = ival;
      c1[d] = Math.round((fval - Math.floor(fval)) * 256);
    }
    return { ofs, c1, clamped };
  };
  const cx = coeffs(dstWidth, width);
  const cy = coeffs(dstHeight, height);
  const hrow = (y: number, out: Uint32Array) => {
    const srow = y * width;
    for (let d = 0; d < dstWidth; d++) {
      const o = cx.ofs[d];
      if (cx.clamped[d] !== 0) {
        out[d] = src[srow + o] << 8;
      } else {
        const c1 = cx.c1[d];
        out[d] = src[srow + o] * (256 - c1) + src[srow + o + 1] * c1;
      }
    }
  };
  const dst = new Uint8Array(dstWidth * dstHeight);
  let bufA = new Uint32Array(dstWidth);
  let bufB = new Uint32Array(dstWidth);
  let rowA = -1;
  let rowB = -1;
  for (let dy = 0; dy < dstHeight; dy++) {
    const o = cy.ofs[dy];
    const drow = dy * dstWidth;
    if (cy.clamped[dy] !== 0) {
      if (rowA !== o) {
        hrow(o, bufA);
        rowA = o;
      }
      for (let x = 0; x < dstWidth; x++) dst[drow + x] = (bufA[x] + 128) >>> 8;
      continue;
    }
    if (rowA !== o) {
      if (rowB === o) {
        const t = bufA;
        bufA = bufB;
        bufB = t;
        rowA = o;
        rowB = -1;
      } else {
        hrow(o, bufA);
        rowA = o;
      }
    }
    if (rowB !== o + 1) {
      hrow(o + 1, bufB);
      rowB = o + 1;
    }
    const c1 = cy.c1[dy];
    const c0 = 256 - c1;
    for (let x = 0; x < dstWidth; x++) {
      dst[drow + x] = Math.min(255, (bufA[x] * c0 + bufB[x] * c1 + 32768) >>> 16);
    }
  }
  return dst;
}

/** OpenCV の createLineSegmentDetector() の既定(LSD_REFINE_STD, scale 0.8, sigma_scale 0.6, quant 2.0, ang_th 22.5, log_eps 0, density_th 0.7, n_bins 1024)と同じ線分を返す。戻り値は [x1, y1, x2, y2, ...] */
export function detectLineSegments(gray: Uint8Array, width: number, height: number): Float32Array {
  const prec = (Math.PI * ANG_TH) / 180;
  const p = ANG_TH / 180;
  const rho = QUANT / Math.sin(prec);

  const sigma = SIGMA_SCALE / SCALE;
  const h = Math.ceil(sigma * Math.sqrt(2 * 3 * Math.log(10)));
  const blurred = gaussianBlur(gray, width, height, 1 + 2 * h, sigma);
  const w = Math.round(width * SCALE);
  const ht = Math.round(height * SCALE);
  if (w < 2 || ht < 2) return new Float32Array(0);
  const img = resizeLinearExact(blurred, width, height, w, ht, SCALE);

  // ll_angle: 2x2 の差分で勾配を求める。下と右の端の 1 列は決まらない
  const deg = new Float32Array(w * ht).fill(NOTDEF);
  const gradNorm = (i: number) => {
    const da = img[i + w + 1] - img[i];
    const bc = img[i + 1] - img[i + w];
    const gx = da + bc;
    const gy = da - bc;
    return Math.sqrt((gx * gx + gy * gy) / 4.0);
  };
  let maxGrad = -1;
  let defined = 0;
  for (let y = 0; y < ht - 1; y++) {
    for (let x = 0, i = y * w; x < w - 1; x++, i++) {
      const da = img[i + w + 1] - img[i];
      const bc = img[i + 1] - img[i + w];
      const gx = da + bc;
      const gy = da - bc;
      const norm = Math.sqrt((gx * gx + gy * gy) / 4.0);
      if (norm > rho) {
        deg[i] = fastAtan2(gx, -gy);
        if (norm > maxGrad) maxGrad = norm;
        defined++;
      }
    }
  }

  // 勾配の強い順(ビンの降順)。同じビンの中は行の順で、OpenCV の stable_sort と同じ並び。
  // 向きの決まらない画素は種にならないので並べない
  const binCoef = maxGrad > 0 ? (N_BINS - 1) / maxGrad : 0;
  const binStart = new Int32Array(N_BINS + 1);
  for (let y = 0; y < ht - 1; y++) {
    for (let x = 0, i = y * w; x < w - 1; x++, i++) {
      if (deg[i] !== NOTDEF) binStart[N_BINS - 1 - Math.floor(gradNorm(i) * binCoef) + 1]++;
    }
  }
  for (let b = 0; b < N_BINS; b++) binStart[b + 1] += binStart[b];
  const order = new Int32Array(defined);
  for (let y = 0; y < ht - 1; y++) {
    for (let x = 0, i = y * w; x < w - 1; x++, i++) {
      if (deg[i] !== NOTDEF) order[binStart[N_BINS - 1 - Math.floor(gradNorm(i) * binCoef)]++] = i;
    }
  }

  const logNT = (5 * (Math.log10(w) + Math.log10(ht))) / 2 + Math.log10(11.0);
  const minRegSize = Math.floor(-logNT / Math.log10(p));

  const used = new Uint8Array(w * ht);
  // 領域の画素(画素の番号)。並びは OpenCV の std::vector と同じに保つ(和の順が結果に効く)
  let reg = new Int32Array(1024);
  let regSize = 0;
  let regAngle = 0;
  // 領域を囲む長方形(region2rect)
  let rx1 = 0;
  let ry1 = 0;
  let rx2 = 0;
  let ry2 = 0;
  let rWidth = 0;

  const isAligned = (i: number, theta: number, tol: number) => {
    const a = deg[i];
    if (a === NOTDEF) return false;
    let nTheta = theta - a * DEG_TO_RADS;
    if (nTheta < 0) nTheta = -nTheta;
    if (nTheta > M_3_2_PI) {
      nTheta -= M_2__PI;
      if (nTheta < 0) nTheta = -nTheta;
    }
    return nTheta <= tol;
  };

  const regionGrow = (seed: number, tol: number) => {
    regSize = 0;
    reg[regSize++] = seed;
    regAngle = deg[seed] * DEG_TO_RADS;
    let sumdx = f32(Math.cos(regAngle));
    let sumdy = f32(Math.sin(regAngle));
    used[seed] = 1;
    for (let r = 0; r < regSize; r++) {
      const pi = reg[r];
      const px = pi % w;
      const py = (pi - px) / w;
      const xMin = px > 0 ? px - 1 : 0;
      const xMax = px < w - 1 ? px + 1 : w - 1;
      const yMin = py > 0 ? py - 1 : 0;
      const yMax = py < ht - 1 ? py + 1 : ht - 1;
      for (let yy = yMin; yy <= yMax; yy++) {
        for (let xx = xMin; xx <= xMax; xx++) {
          const j = yy * w + xx;
          if (used[j] !== 1 && isAligned(j, regAngle, tol)) {
            used[j] = 1;
            if (regSize === reg.length) {
              const grown = new Int32Array(reg.length * 2);
              grown.set(reg);
              reg = grown;
            }
            reg[regSize++] = j;
            // OpenCV は float の角度の cos・sin を float で足し込む
            const fa = f32(deg[j] * DEG_TO_RADS);
            sumdx = f32(sumdx + f32(Math.cos(fa)));
            sumdy = f32(sumdy + f32(Math.sin(fa)));
            regAngle = fastAtan2(sumdy, sumdx) * DEG_TO_RADS;
          }
        }
      }
    }
  };

  const region2rect = (angle: number) => {
    let x = 0;
    let y = 0;
    let sum = 0;
    for (let r = 0; r < regSize; r++) {
      const i = reg[r];
      const px = i % w;
      const py = (i - px) / w;
      const weight = gradNorm(i);
      x += px * weight;
      y += py * weight;
      sum += weight;
    }
    x /= sum;
    y /= sum;

    // get_theta: 慣性の主軸の向き
    let ixx = 0;
    let iyy = 0;
    let ixy = 0;
    for (let r = 0; r < regSize; r++) {
      const i = reg[r];
      const px = i % w;
      const py = (i - px) / w;
      const weight = gradNorm(i);
      const dx = px - x;
      const dy = py - y;
      ixx += dy * dy * weight;
      iyy += dx * dx * weight;
      ixy -= dx * dy * weight;
    }
    const lambda = 0.5 * (ixx + iyy - Math.sqrt((ixx - iyy) * (ixx - iyy) + 4.0 * ixy * ixy));
    let theta =
      Math.abs(ixx) > Math.abs(iyy) ? fastAtan2(f32(lambda - ixx), f32(ixy)) : fastAtan2(f32(ixy), f32(lambda - iyy));
    theta *= DEG_TO_RADS;
    if (Math.abs(angleDiffSigned(theta, angle)) > prec) theta += Math.PI;

    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    let lMin = 0;
    let lMax = 0;
    let wMin = 0;
    let wMax = 0;
    for (let r = 0; r < regSize; r++) {
      const i = reg[r];
      const px = i % w;
      const regdx = px - x;
      const regdy = (i - px) / w - y;
      const l = regdx * dx + regdy * dy;
      const wd = -regdx * dy + regdy * dx;
      // OpenCV と同じく else if(最大を更新したら最小は見ない)
      if (l > lMax) lMax = l;
      else if (l < lMin) lMin = l;
      if (wd > wMax) wMax = wd;
      else if (wd < wMin) wMin = wd;
    }
    rx1 = x + lMin * dx;
    ry1 = y + lMin * dy;
    rx2 = x + lMax * dx;
    ry2 = y + lMax * dy;
    rWidth = wMax - wMin;
    if (rWidth < 1.0) rWidth = 1.0;
  };

  const density = () => regSize / (Math.sqrt((rx2 - rx1) * (rx2 - rx1) + (ry2 - ry1) * (ry2 - ry1)) * rWidth);

  const reduceRegionRadius = () => {
    const seed = reg[0];
    const xc = seed % w;
    const yc = (seed - xc) / w;
    const radSq1 = (rx1 - xc) * (rx1 - xc) + (ry1 - yc) * (ry1 - yc);
    const radSq2 = (rx2 - xc) * (rx2 - xc) + (ry2 - yc) * (ry2 - yc);
    let radSq = radSq1 > radSq2 ? radSq1 : radSq2;
    while (density() < DENSITY_TH) {
      radSq *= 0.75 * 0.75;
      for (let r = 0; r < regSize; r++) {
        const i = reg[r];
        const px = i % w;
        const py = (i - px) / w;
        if ((px - xc) * (px - xc) + (py - yc) * (py - yc) > radSq) {
          used[i] = 0;
          // 末尾と入れ替えて消す(OpenCV と同じ並びの変わり方)
          reg[r] = reg[regSize - 1];
          regSize--;
          r--;
        }
      }
      if (regSize < 2) return false;
      region2rect(regAngle);
    }
    return true;
  };

  const refine = () => {
    if (density() >= DENSITY_TH) return true;

    // 種の近くの角度のばらつきから、角度の許容を狭めて領域を作り直す
    const seed = reg[0];
    const xc = seed % w;
    const yc = (seed - xc) / w;
    const angC = deg[seed] * DEG_TO_RADS;
    let sum = 0;
    let sSum = 0;
    let n = 0;
    for (let r = 0; r < regSize; r++) {
      const i = reg[r];
      used[i] = 0;
      const px = i % w;
      const py = (i - px) / w;
      if (Math.sqrt((px - xc) * (px - xc) + (py - yc) * (py - yc)) < rWidth) {
        const angD = angleDiffSigned(deg[i] * DEG_TO_RADS, angC);
        sum += angD;
        sSum += angD * angD;
        n++;
      }
    }
    const meanAngle = sum / n;
    const tau = 2.0 * Math.sqrt((sSum - 2.0 * meanAngle * sum) / n + meanAngle * meanAngle);

    regionGrow(seed, tau);
    if (regSize < 2) return false;
    region2rect(regAngle);
    if (density() < DENSITY_TH) return reduceRegionRadius();
    return true;
  };

  const out: number[] = [];
  for (let k = 0; k < order.length; k++) {
    const seed = order[k];
    if (used[seed] !== 0) continue;
    regionGrow(seed, prec);
    if (regSize < minRegSize) continue;
    region2rect(regAngle);
    if (!refine()) continue;
    out.push((rx1 + 0.5) / SCALE, (ry1 + 0.5) / SCALE, (rx2 + 0.5) / SCALE, (ry2 + 0.5) / SCALE);
  }
  return Float32Array.from(out);
}
