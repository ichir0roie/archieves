/**
 * 写真の矢の推測(src/lib/photo/vision)を、手で付けた正解(photo-eval-labels.json)と比べて点数を出す。
 *
 *     npm run photo-eval -- <写真のフォルダ> [--overlay <画像を書き出すフォルダ>]
 *
 * 画面は推測を確からしい順に受け、エンドの本数だけを先頭から矢として入れる(scoreManager.applyEstimates)。
 * それに合わせ、写真ごとに推測の上位 K 本(K = 正解の本数)を正解と 1 対 1 で組み、
 * 点数が合った本数を数える。
 *
 * - 正解は、的に対する割合(左上が 0、中心が 0.5)。補正した正面の画像に格子を描いて読んだもので、
 *   読み取りの誤差はおよそ 0.007
 * - 組み方は、距離の近い組から順に決める(本数が少ないので、最適な割り当てとの差は小さい)
 * - 点数は中心からの距離だけで決める(1 点の帯は 0.05)。矢の太さ・インサイドアウトは見ない
 * - 写真は持たない(利用者の写真なのでリポジトリに置かない)。フォルダを引数で渡す
 * - 写真は、撮るときの決まり(的の全体が写る・矢がなるべく重ならない)を守ったものだけにする。
 *   矢が重なって刺さった点が隠れた写真は、正解を読み切れないので入れない
 * - 写真モードはノックの色の登録が要るので、写真ごとのノックの色(nock_colors。拾えたノックの鮮やかな
 *   画素から測った値で、登録の画面で何本か押すのに近い)を渡して処理する
 * - tune は数字を決めるのに使った写真、check は決めるのに使っていない確かめ用の写真。
 *   数字を変えたら、check でも上がるかを見る(tune だけで上がるのは、写真に合わせ込んだだけ)
 * - 写真の読み込み(向きを直す・大きな JPEG を縮めて読む)は、ブラウザの代わりに sharp で行う。
 *   縮め方はブラウザと少し違うので、数字はブラウザの結果とわずかにずれることがある
 */

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { analyzePixels, DISPLAY_EXTENT, DISPLAY_MAX_PX } from "../src/lib/photo/vision/analyze";
import { decodeScale } from "../src/lib/photo/vision/decode";

type Point = [number, number];

const LABELS_PATH = path.join(__dirname, "photo-eval-labels.json");
const RING_WIDTH = 0.05;
/** 正解に近いとみなす距離。半分の帯と 1 つの帯 */
const NEAR = 0.025;
const WITHIN_RING = 0.05;
const COLUMNS = ["本数", "点数一致", "半帯内", "1帯内", "全推測で1帯内"] as const;
type Column = (typeof COLUMNS)[number];

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function ring([x, y]: Point): number {
  return Math.max(0, 10 - Math.floor(distance([x, y], [0.5, 0.5]) / RING_WIDTH));
}

/** 正解ごとに、組んだ推測の番号。組めなかった正解は null */
function match(truths: Point[], estimates: Point[]): Array<number | null> {
  const pairs = truths
    .flatMap((t, i) => estimates.map((e, j): [number, number, number] => [distance(t, e), i, j]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const usedT = new Set<number>();
  const usedE = new Set<number>();
  const matched: Array<number | null> = truths.map(() => null);
  for (const [, i, j] of pairs) {
    if (usedT.has(i) || usedE.has(j)) continue;
    usedT.add(i);
    usedE.add(j);
    matched[i] = j;
  }
  return matched;
}

async function decode(file: string) {
  const image = sharp(readFileSync(file)).rotate();
  const { width = 0, height = 0, orientation = 1 } = await image.metadata();
  // metadata の大きさは向きを直す前のもの
  const turned = orientation >= 5 && orientation <= 8;
  const originalWidth = turned ? height : width;
  const originalHeight = turned ? width : height;
  const scale = decodeScale(originalWidth, originalHeight);
  const { data, info } = await image
    .resize(Math.round(originalWidth / scale), Math.round(originalHeight / scale))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    image: { width: info.width, height: info.height, data: new Uint8Array(data) },
    originalWidth,
  };
}

async function writeOverlay(file: string, display: Uint8ClampedArray, truths: Point[], estimates: Point[]) {
  const unit = DISPLAY_MAX_PX / (1 + 2 * DISPLAY_EXTENT);
  const px = ([x, y]: Point) => [(x + DISPLAY_EXTENT) * unit, (y + DISPLAY_EXTENT) * unit];
  const marks = [
    ...truths.map((t) => {
      const [x, y] = px(t);
      return `<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="#00ff00" stroke-width="3"/>`;
    }),
    ...estimates.map((e, rank) => {
      const [x, y] = px(e);
      return (
        `<path d="M${x - 10} ${y - 10}L${x + 10} ${y + 10}M${x - 10} ${y + 10}L${x + 10} ${y - 10}" stroke="#ff0000" stroke-width="4"/>` +
        `<text x="${x + 10}" y="${y - 10}" fill="#ff0000" font-size="28">${rank + 1}</text>`
      );
    }),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DISPLAY_MAX_PX}" height="${DISPLAY_MAX_PX}">${marks.join("")}</svg>`;
  await sharp(Buffer.from(display), { raw: { width: DISPLAY_MAX_PX, height: DISPLAY_MAX_PX, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toFile(file);
}

async function main() {
  const args = process.argv.slice(2);
  const overlayIndex = args.indexOf("--overlay");
  const overlay = overlayIndex >= 0 ? args[overlayIndex + 1] : null;
  const folder = args.find((arg, i) => !arg.startsWith("--") && i !== overlayIndex + 1);
  if (!folder || (overlayIndex >= 0 && !overlay)) {
    console.error("usage: npm run photo-eval -- <写真のフォルダ> [--overlay <画像を書き出すフォルダ>]");
    process.exit(2);
  }
  if (overlay) mkdirSync(overlay, { recursive: true });
  const { nock_colors: nockColors, ...labelSets } = JSON.parse(readFileSync(LABELS_PATH, "utf-8")) as {
    nock_colors: Record<string, string>;
  } & Record<string, Record<string, Point[]>>;

  console.log("写真".padEnd(26) + COLUMNS.map((c) => c.padStart(8)).join("") + "秒".padStart(6));
  const summaries: string[] = [];
  for (const [setName, labels] of Object.entries(labelSets)) {
    const totals = Object.fromEntries(COLUMNS.map((c) => [c, 0])) as Record<Column, number>;
    const errors: number[] = [];
    for (const [name, truths] of Object.entries(labels)) {
      const { image, originalWidth } = await decode(path.join(folder, name));
      const started = performance.now();
      const result = analyzePixels(image, originalWidth, {
        nockColor: nockColors[name] ?? null,
        fletchColor: null,
        alignment: null,
      });
      const seconds = (performance.now() - started) / 1000;
      const all: Point[] = result.rectified ? result.estimates.map((e): Point => [e.x, e.y]) : [];
      const top = all.slice(0, truths.length);
      const pairs = match(truths, top).flatMap((j, i): Array<[Point, Point]> => (j === null ? [] : [[truths[i], top[j]]]));
      const distances = pairs.map(([t, e]) => distance(t, e));
      const counts: Record<Column, number> = {
        本数: truths.length,
        点数一致: pairs.filter(([t, e]) => ring(t) === ring(e)).length,
        半帯内: distances.filter((d) => d <= NEAR).length,
        "1帯内": distances.filter((d) => d <= WITHIN_RING).length,
        // 順位を問わず、どれかの推測が 1 帯以内にある正解。見つけたのに上位に来なかったものを分ける
        全推測で1帯内: truths.filter((t) => all.some((e) => distance(t, e) <= WITHIN_RING)).length,
      };
      for (const column of COLUMNS) totals[column] += counts[column];
      errors.push(...distances);
      console.log(name.padEnd(26) + COLUMNS.map((c) => String(counts[c]).padStart(8)).join("") + seconds.toFixed(1).padStart(6));
      if (overlay && result.rectified) await writeOverlay(path.join(overlay, `${name}.jpg`), result.display, truths, top);
    }
    const total = totals["本数"];
    const sorted = [...errors].sort((a, b) => a - b);
    const median = sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : NaN;
    summaries.push(
      `${setName}: ` +
        COLUMNS.slice(1)
          .map((c) => `${c} ${totals[c]}/${total} (${Math.round((totals[c] / total) * 100)}%)`)
          .join("  ") +
        `  誤差の中央値 ${median.toFixed(3)}`,
    );
  }
  console.log(summaries.join("\n"));
}

void main();
