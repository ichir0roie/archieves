/**
 * 写真モードの写真を処理する。的を正面に補正し、矢の刺さった点を推測する(画素の計算だけ。
 * 画像の読み書きはブラウザの側の photoAnalysis.ts)。
 *
 * - 的が見つかれば(target.ts)、表示の画像は的を正面から見た形の正方形にする。
 *   的に対する割合で -DISPLAY_EXTENT から 1 + DISPLAY_EXTENT まで(的紙の外に刺さった矢も写す)
 * - 矢は arrows.ts で探し、確からしい順に返す
 * - 的が見つからなければ、補正も推測もしない(表示の画像は向きを直して縮めただけのもの)
 *
 * 処理を変えたら ANALYZER_VERSION を上げる。
 */

import type { ArrowColor } from "@/lib/api/schemas";
import type { Point } from "../alignment";
import { detectArrows, findSegments, type DetectedArrow } from "./arrows";
import { resizeArea, rgbToGray, rgbToHsv, warpPerspectiveRgba, type RgbImage } from "./image";
import { diagonal, multiply, type Mat3 } from "./matrix";
import { findTarget, fitFromPoints, scaleFit } from "./target";

/** API に結果と一緒に残す、処理のバージョン */
export const ANALYZER_VERSION = "web-1";

/**
 * 表示の画像の長辺(px)。スマホの写真で的が写る幅(2000〜2500px)に見合い、入力の画面のズームで
 * 見ても粗くない。これより大きくしても、元の写真に無い細かさは出ない
 */
export const DISPLAY_MAX_PX = 2000;
/** 的と矢を探す作業画像の長辺(px)。的を見つけるにはこれで足り、元の大きさで探すより速い */
const WORK_PX = 1000;
/** 補正した表示の画像に、的の外をどこまで写すか(的に対する割合) */
export const DISPLAY_EXTENT = 0.25;
/** 返す推測の数の上限(1 エンドの矢の数より多めに返し、画面が本数で切る) */
const MAX_ESTIMATES = 24;

export type AnalyzeOptions = {
  nockColor: string | null;
  fletchColor: ArrowColor | null;
  /** 人が合わせた 4 点(向きを直した元の写真の幅・高さに対する割合)。あれば的を探さずにこれで補正する */
  alignment: ReadonlyArray<Point> | null;
};

export type PixelAnalysis =
  | { rectified: false }
  | {
      rectified: true;
      /** 元の写真の px を、的に対する割合へ写す 3x3(右下を 1 にしたもの) */
      homography: Mat3;
      estimates: DetectedArrow[];
      /** 補正した表示の画像(DISPLAY_MAX_PX 四方の RGBA) */
      display: Uint8ClampedArray;
    };

/**
 * decoded は、向きを直して読み込んだ写真(元の写真より小さく読み込んでもよい)。
 * originalWidth は、向きを直したあとの元の写真の幅(homography を元の写真の px からのものにする)
 */
export function analyzePixels(decoded: RgbImage, originalWidth: number, options: AnalyzeOptions): PixelAnalysis {
  const workScale = Math.min(1, WORK_PX / Math.max(decoded.width, decoded.height));
  const work = workScale < 1 ? resizeArea(decoded, workScale) : decoded;
  const fit = options.alignment
    ? fitFromPoints(options.alignment.map(([x, y]) => [x * work.width, y * work.height]))
    : findTarget(work);
  if (fit === null) return { rectified: false };

  // 作業画像の px → 的の割合 を、読み込んだ画像の px・元の写真の px からのものにする
  const toDecoded = multiply(fit.homography, diagonal(workScale, workScale, 1));
  const decodedScale = decoded.width / originalWidth;
  const toOriginal = multiply(toDecoded, diagonal(decodedScale, decodedScale, 1));
  // 的の割合 → 表示の画像の px
  const side = DISPLAY_MAX_PX;
  const unit = side / (1 + 2 * DISPLAY_EXTENT);
  const toDisplay: Mat3 = [
    unit,
    0,
    unit * DISPLAY_EXTENT,
    0,
    unit,
    unit * DISPLAY_EXTENT,
    0,
    0,
    1,
  ];
  const display = warpPerspectiveRgba(decoded, multiply(toDisplay, toDecoded), side, side);
  // 矢の軸は細いので、的を探した作業画像でなく、読み込んだ大きさの画像で探す
  const segments = findSegments(rgbToGray(decoded), decoded.width, decoded.height);
  const estimates = detectArrows(
    rgbToHsv(decoded),
    segments,
    scaleFit(fit, 1 / workScale),
    options.nockColor,
    options.fletchColor,
  ).slice(0, MAX_ESTIMATES);
  return {
    rectified: true,
    homography: toOriginal.map((value) => value / toOriginal[8]),
    estimates,
    display,
  };
}
