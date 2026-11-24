/**
 * テスト用の、的と矢の写った写真(e2e/fixtures/photos)。刺さった点が分かっているので、推測の確かめに使う。
 *
 * 写真は、API が写真を処理していたころのテスト(source/back/tests/photo_samples.py。git の履歴にある)が
 * OpenCV で描いたものを PNG に書き出したもの。処理をブラウザへ移したとき、同じ写真で同じ結果になることを
 * 確かめたので、そのまま使う。的(1x1)を CORNERS へ射影で歪めて畳の色の背景に置き、矢は刺さった点から
 * (70, 230) px 先のノックまで、軸・羽根・ノックで描いてある。
 *
 * | 写真 | 中身 |
 * | --- | --- |
 * | four-arrows | 緑のノックの矢 4 本((0.5, 0.5)・(0.42, 0.6)・(0.62, 0.45)・(0.55, 0.7)) |
 * | four-arrows-redrawn | four-arrows と同じ矢を、別の描き方(縁のなめらかさ・座標の丸め)で描いたもの。軸の向きを長さで重み付けする前は、
 *   (0.62, 0.45) の矢が、刺さった点の先の短い線分に向きを振られて拾えなかった |
 * | no-arrows | 矢の無い的 |
 * | two-nock-colors | 緑のノック 2 本((0.5, 0.5)・(0.42, 0.6))とオレンジのノック 2 本((0.62, 0.45)・(0.55, 0.7)) |
 * | two-arrows | 白い羽根・緑のノックの矢 2 本((0.5, 0.5)・(0.42, 0.6)) |
 * | blue-background | 青い背景の上の的と、(0.5, 0.5) の矢 |
 * | no-target | 的の無い畳 |
 * | gold-on-red | 赤い背景の上の黄の丸(的でない) |
 * | radiating | 左下の外 (-0.3, 0.9) から放射状に伸びる矢((0.3, 0.35)・(0.65, 0.3)・(0.7, 0.6)・中心の真下の (0.5, 0.8)) |
 * | lookalikes | 灰色の背景。(0.5, 0.5) の矢と、矢でないもの(短すぎる軸・的の外で終わる軸・黄の丸・黄の帯・緑の塊) |
 * | grayscale | 白黒の的(色の帯が無い)と、緑のノックを描き直した矢 2 本((0.5, 0.5)・(0.42, 0.6)) |
 */

import path from "node:path";
import sharp from "sharp";
import type { RgbImage } from "@/lib/photo/vision/image";
import { perspectiveTransform, project, type Mat3 } from "@/lib/photo/vision/matrix";

export const CANVAS = { width: 1200, height: 1600 };

/** 的(1x1)の四隅を置いた所。上が狭い台形で、下から見上げて撮ったように歪めてある */
const CORNERS: Array<[number, number]> = [
  [260, 330],
  [980, 360],
  [1060, 1250],
  [170, 1210],
];

export type SampleName =
  | "four-arrows"
  | "four-arrows-redrawn"
  | "no-arrows"
  | "two-nock-colors"
  | "two-arrows"
  | "blue-background"
  | "no-target"
  | "gold-on-red"
  | "radiating"
  | "lookalikes"
  | "grayscale";

export async function loadSample(name: SampleName): Promise<RgbImage> {
  const { data, info } = await sharp(path.join(__dirname, "fixtures", "photos", `${name}.png`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

/** 的の割合 → 写真の px */
export function homography(): Mat3 {
  return perspectiveTransform(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    CORNERS,
  ) as Mat3;
}

/** 的の割合の点の、写真の上の px */
export function toPhoto(x: number, y: number): [number, number] {
  return project(homography(), x, y);
}

/** 合わせる 4 点の本当の位置(写真の幅・高さに対する割合) */
export function trueAlignment(): Array<[number, number]> {
  return [
    [0.5, 0.3],
    [0.7, 0.5],
    [0.5, 0.7],
    [0.3, 0.5],
  ].map(([x, y]) => {
    const [px, py] = toPhoto(x, y);
    return [px / CANVAS.width, py / CANVAS.height];
  });
}
