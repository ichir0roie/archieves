import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { analyzePixels, DISPLAY_EXTENT, DISPLAY_MAX_PX, type AnalyzeOptions } from "@/lib/photo/vision/analyze";
import {
  ACHROMATIC_SATURATION,
  distinctArrows,
  findSegments,
  nockRanges,
  traceShaft,
  vanishingPoint,
  type DetectedArrow,
} from "@/lib/photo/vision/arrows";
import { decodeScale, readJpegInfo } from "@/lib/photo/vision/decode";
import { rgbToHsv, type RgbImage } from "@/lib/photo/vision/image";
import { project } from "@/lib/photo/vision/matrix";
import { alignmentPointsOf, ringMasks } from "@/lib/photo/vision/target";
import { CANVAS, homography, loadSample, toPhoto, trueAlignment } from "./photoSamples";

// 写真の処理(src/lib/photo/vision。ブラウザで回す)を、描いた写真(e2e/photoSamples.ts)で、
// 刺さった点が分かる形で確かめる。画面は開かない(Node で処理だけを回す)

const TRUE_POINTS: Array<[number, number]> = [
  [0.5, 0.5],
  [0.42, 0.6],
  [0.62, 0.45],
  [0.55, 0.7],
];

const NO_OPTIONS: AnalyzeOptions = { nockColor: null, fletchColor: null, alignment: null };

function analyze(image: RgbImage, options: Partial<AnalyzeOptions> = {}) {
  return analyzePixels(image, image.width, { ...NO_OPTIONS, ...options });
}

function estimatesOf(result: ReturnType<typeof analyze>): DetectedArrow[] {
  if (!result.rectified) throw new Error("not rectified");
  return result.estimates;
}

function nearest(estimates: DetectedArrow[], x: number, y: number): number {
  return Math.min(...estimates.map((e) => Math.hypot(e.x - x, e.y - y)));
}

test("a photo taken at an angle is rectified and its arrows are estimated", async () => {
  const result = analyze(await loadSample("four-arrows"));

  expect(result.rectified).toBe(true);
  if (!result.rectified) return;
  expect(result.display.length).toBe(DISPLAY_MAX_PX * DISPLAY_MAX_PX * 4);
  expect(result.estimates).toHaveLength(TRUE_POINTS.length);
  for (const [x, y] of TRUE_POINTS) expect(nearest(result.estimates, x, y)).toBeLessThan(0.02);
  for (const e of result.estimates) {
    expect(e.confidence).toBeGreaterThan(0);
    expect(e.confidence).toBeLessThanOrEqual(1);
  }
  // 元の写真の px を、的に対する割合へ写す
  for (const [x, y] of [
    [0.2, 0.3],
    [0.7, 0.8],
  ]) {
    const [px, py] = toPhoto(x, y);
    const [u, v] = project(result.homography, px, py);
    expect(Math.hypot(u - x, v - y)).toBeLessThan(0.01);
  }
});

test("a short line beyond the entry point does not turn the shaft direction", async () => {
  // 軸の向きは線分の長さで重み付けして決める。刺さった点の先で的の線がたまたま軸の延長に乗っても、
  // 軸の縁(長い線分)と同じ重さに数えて向きを傾けない
  const estimates = estimatesOf(analyze(await loadSample("four-arrows-redrawn")));

  expect(estimates).toHaveLength(TRUE_POINTS.length);
  for (const [x, y] of TRUE_POINTS) expect(nearest(estimates, x, y)).toBeLessThan(0.02);
});

test("the rectified display shows the target upright and centered", async () => {
  const result = analyze(await loadSample("no-arrows"));
  expect(result.rectified).toBe(true);
  if (!result.rectified) return;
  const rgb = new Uint8Array(DISPLAY_MAX_PX * DISPLAY_MAX_PX * 3);
  for (let i = 0, p = 0; p < rgb.length; i += 4, p += 3) rgb.set(result.display.subarray(i, i + 3), p);
  const gold = ringMasks(rgbToHsv({ width: DISPLAY_MAX_PX, height: DISPLAY_MAX_PX, data: rgb })).yellow.data;
  const unit = DISPLAY_MAX_PX / (1 + 2 * DISPLAY_EXTENT);
  // 畳も金と同じ色相なので、中央の近くだけを見る
  const lo = Math.round(DISPLAY_MAX_PX / 2 - unit * 0.3);
  const hi = Math.round(DISPLAY_MAX_PX / 2 + unit * 0.3);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = lo; y < hi; y++) {
    for (let x = lo; x < hi; x++) {
      if (gold[y * DISPLAY_MAX_PX + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  // 金の中心は表示の画像の中央、金の幅は的の 2 割
  expect(Math.abs(mean(xs) - DISPLAY_MAX_PX / 2)).toBeLessThan(10);
  expect(Math.abs(mean(ys) - DISPLAY_MAX_PX / 2)).toBeLessThan(10);
  expect(Math.abs(Math.max(...xs) - Math.min(...xs) - unit * 0.2)).toBeLessThan(15);
  expect(Math.abs(Math.max(...ys) - Math.min(...ys) - unit * 0.2)).toBeLessThan(15);
  expect(result.estimates).toEqual([]);
});

test("only arrows with the game's nock color are taken", async () => {
  const image = await loadSample("two-nock-colors");

  const everyone = estimatesOf(analyze(image));
  // ノックの色は、矢の写真から測った色(描いたノックの色)
  const green = estimatesOf(analyze(image, { nockColor: "#3cff28" }));
  const orange = estimatesOf(analyze(image, { nockColor: "#ff7800" }));

  expect(everyone).toHaveLength(4);
  expect(green).toHaveLength(2);
  expect(nearest(green, 0.5, 0.5)).toBeLessThan(0.02);
  expect(nearest(green, 0.42, 0.6)).toBeLessThan(0.02);
  expect(orange).toHaveLength(2);
  expect(nearest(orange, 0.62, 0.45)).toBeLessThan(0.02);
  expect(nearest(orange, 0.55, 0.7)).toBeLessThan(0.02);
});

test("a measured nock color is looked for around its hue", () => {
  const hues = (ranges: ReturnType<typeof nockRanges>) =>
    new Set(ranges.flatMap(([low, high]) => [low[0], high[0]]));
  // 赤は色相の 0 と 180 をまたぐので、両側を探す
  const red = nockRanges("#e02020");
  expect(red).toHaveLength(2);
  expect(hues(red).has(0) && hues(red).has(180)).toBe(true);
  // 赤紫は色相の 180 をまたぐ
  const magenta = nockRanges("#ff2050");
  expect(magenta).toHaveLength(2);
  expect(hues(magenta).has(0) && hues(magenta).has(180)).toBe(true);
  // 白は色相が決まらないので、明るさで探す
  const [[low, high], ...rest] = nockRanges("#f5f5f5");
  expect(rest).toEqual([]);
  expect([low[0], high[0]]).toEqual([0, 180]);
  expect(high[1]).toBeLessThanOrEqual(ACHROMATIC_SATURATION);
  expect(low[2]).toBeGreaterThan(150);
});

test("the fletch color raises or lowers the confidence", async () => {
  const image = await loadSample("two-arrows");

  const plain = estimatesOf(analyze(image));
  const matching = estimatesOf(analyze(image, { fletchColor: "white" }));
  // オレンジの羽根は写っていない(青は的の帯にあるので使わない)
  const other = estimatesOf(analyze(image, { fletchColor: "orange" }));

  const sum = (arrows: DetectedArrow[]) => arrows.reduce((total, e) => total + e.confidence, 0);
  expect(Math.min(...matching.map((e) => e.confidence))).toBeGreaterThan(Math.max(...other.map((e) => e.confidence)));
  expect(sum(plain)).toBeGreaterThan(sum(other));
});

test("lookalikes around the target are not taken", async () => {
  // 軸の短すぎる矢(ノックの直後で途切れる)・的から離れすぎた所で終わる軸(台・背景の色の塊からたどった線)・
  // 赤に囲まれない黄の丸・細長い黄の帯・的から遠い緑の塊・軸の無い緑の塊・光で割れた一つのノックは、推測にしない
  const estimates = estimatesOf(analyze(await loadSample("lookalikes")));

  expect(estimates).toHaveLength(1);
  expect(nearest(estimates, 0.5, 0.5)).toBeLessThan(0.02);
});

test("a target on a blue background is rectified from the red ring", async () => {
  const estimates = estimatesOf(analyze(await loadSample("blue-background")));

  expect(nearest(estimates, 0.5, 0.5)).toBeLessThan(0.03);
});

test("a photo without a target or with gold on a red field is not rectified", async () => {
  expect(analyze(await loadSample("no-target")).rectified).toBe(false);
  expect(analyze(await loadSample("gold-on-red")).rectified).toBe(false);
});

test("no segments are found in a blank image", () => {
  expect(findSegments(new Uint8Array(50 * 50), 50, 50)).toHaveLength(0);
});

test("a shaft hidden in places is followed to where it enters the target", () => {
  // ノック (0, 0) から上(的の中心の側)へ伸びる軸。途中の 80px は羽根・印字で見えず、
  // 300px で的に刺さる。その先に離れて一つある短い線分(的の線・穴の縁)までは行かない
  const segments = Float32Array.from([0, -20, 0, -100, 0, -180, 0, -300, 0, -360, 0, -372]);

  const traced = traceShaft([0, 0], segments, 500, 3, [0, -1000]);

  expect(traced).not.toBeNull();
  expect(Math.abs(traced!.end[0])).toBeLessThan(1);
  expect(Math.abs(traced!.length - 300)).toBeLessThanOrEqual(4);
});

test("short edges across the shaft line are not taken for the shaft", () => {
  // 軸は 200px で的に刺さる。その先の穴の縁(短く、軸と向きの違う線分)が軸の延長の幅の中に
  // 並んでいても、軸が続いているとはみなさない
  const holes = Array.from({ length: 8 }, (_, i) => [-6, -215 - 15 * i, 6, -224 - 15 * i]).flat();
  const segments = Float32Array.from([0, -20, 0, -200, ...holes]);

  const traced = traceShaft([0, 0], segments, 500, 8, [0, -1000]);

  expect(traced).not.toBeNull();
  expect(Math.abs(traced!.length - 200)).toBeLessThanOrEqual(4);
});

test("the shaft line is fitted to the segments on it", () => {
  // ノックの中心が軸から少しずれていても、軸の線分に当てた直線で遠くまでたどる
  const segments = Float32Array.from(
    Array.from({ length: 7 }, (_, i) => [0, -20 - 60 * i, 0.5, -60 - 60 * i]).flat(),
  );

  const traced = traceShaft([5, 0], segments, 500, 3, [0, -1000]);

  expect(traced).not.toBeNull();
  expect(Math.abs(traced!.end[0])).toBeLessThan(2);
  expect(Math.abs(traced!.end[1] + 420)).toBeLessThanOrEqual(4);
});

test("a line leading away from the target is not followed", () => {
  // ノックから的と逆の向きへ伸びる線(畳の筋・台の縁)はたどらない
  expect(traceShaft([0, 0], Float32Array.from([0, 20, 0, 300]), 500, 3, [0, -1000])).toBeNull();
});

test("a nock beside the center is traced toward where the shafts meet", async () => {
  // 軸はどれも、左下の外(矢の向きの消失点)から放射状に伸びる。中心の真下のノックは、
  // 的の中心への向き(上)と軸の向き(左)が 60 度より大きくずれる
  const estimates = estimatesOf(analyze(await loadSample("radiating")));

  expect(estimates).toHaveLength(4);
  expect(nearest(estimates, 0.5, 0.8)).toBeLessThan(0.02);
});

test("the point where the shafts meet is found only from lines that spread", () => {
  const half = Math.sqrt(0.5);
  const lines: Array<[[number, number], [number, number], number]> = [
    [[100, 0], [-1, 0], 1],
    [[0, 100], [0, -1], 1],
    [[70, 70], [-half, -half], 0.5],
  ];

  const vanishing = vanishingPoint(lines);

  expect(vanishing).not.toBeNull();
  expect(Math.abs(vanishing![0])).toBeLessThan(1e-6);
  expect(Math.abs(vanishing![1])).toBeLessThan(1e-6);
  // 1 本だけ・平行な軸からは決まらない
  expect(vanishingPoint(lines.slice(0, 1))).toBeNull();
  expect(vanishingPoint([0, 1, 2].map((i) => [[0, i], [1, 0], 1]))).toBeNull();
});

test("estimates on the same spot are taken once in order of confidence", () => {
  const distinct = distinctArrows([
    { x: 0.5, y: 0.5, confidence: 0.4 },
    { x: 0.505, y: 0.5, confidence: 0.9 },
    { x: 0.6, y: 0.4, confidence: 0.6 },
  ]);

  expect(distinct.map((a) => [a.x, a.y])).toEqual([
    [0.505, 0.5],
    [0.6, 0.4],
  ]);
});

test("the alignment points follow the automatic rectification", async () => {
  const result = analyze(await loadSample("no-arrows"));
  expect(result.rectified).toBe(true);
  if (!result.rectified) return;

  const points = alignmentPointsOf(result.homography, CANVAS.width, CANVAS.height);

  expect(points).not.toBeNull();
  trueAlignment().forEach(([x, y], i) => {
    expect(Math.hypot(points![i][0] - x, points![i][1] - y)).toBeLessThan(0.01);
  });
});

test("points aligned by hand rectify a photo whose target is not found", async () => {
  // 色の帯の無い的(白黒に写った・色あせた)は見つからないが、手で合わせた 4 点で補正できる
  const gray = await loadSample("grayscale");

  expect(analyze(gray).rectified).toBe(false);

  const result = analyze(gray, { alignment: trueAlignment() });
  const estimates = estimatesOf(result);
  expect(estimates).toHaveLength(2);
  expect(nearest(estimates, 0.5, 0.5)).toBeLessThan(0.02);
  expect(nearest(estimates, 0.42, 0.6)).toBeLessThan(0.02);
  if (!result.rectified) return;
  // 4 点から求めた写し方は、描いたときの写し方の逆
  const [u, v] = project(result.homography, ...project(homography(), 0.3, 0.7));
  expect(Math.hypot(u - 0.3, v - 0.7)).toBeLessThan(0.005);
});

test("the size and orientation of a JPEG are read from its header", async () => {
  const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 60, g: 255, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  expect(readJpegInfo(new Uint8Array(jpeg))).toEqual({ width: 40, height: 30, orientation: 6 });
  expect(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
});

test("large photos are decoded smaller like the old analyzer did", () => {
  // 12MP は縮めない。48MP は半分。縦横のどちらも 2000px を割らない倍率だけ
  expect(decodeScale(4000, 3000)).toBe(1);
  expect(decodeScale(8064, 6048)).toBe(2);
  expect(decodeScale(16320, 12240)).toBe(4);
  expect(decodeScale(1200, 1600)).toBe(1);
});
