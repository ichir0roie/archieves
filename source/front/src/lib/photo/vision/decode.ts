/**
 * ブラウザでの写真の読み込みと、表示の画像の書き出し。Web Worker の中でも、画面の側でも動く。
 */

import type { Point } from "../alignment";
import { analyzePixels, ANALYZER_VERSION, DISPLAY_EXTENT, DISPLAY_MAX_PX, type AnalyzeOptions } from "./analyze";
import type { RgbImage } from "./image";

/** 写真として読めない(壊れたファイル・画像でないファイル) */
export class PhotoUnreadableError extends Error {}

export type EstimatedArrow = { x: number; y: number; confidence: number };

/** 写真の処理の結果。API に送る形(PhotoAnalysisWrite)と同じ中身 */
export type PhotoAnalysisResult = {
  analyzerVersion: string;
  /** 向きを直したあとの元の写真の大きさ */
  width: number;
  height: number;
  rectified: boolean;
  /** 補正した表示の画像が写す、的の外の幅(的に対する割合)。補正しなければ null */
  displayExtent: number | null;
  /** 元の写真の px を、的に対する割合へ写す 3x3(行の順)。補正しなければ null */
  homography: number[][] | null;
  estimates: EstimatedArrow[];
  /** 手で合わせた 4 点。合わせていなければ null */
  alignmentPoints: Point[] | null;
  /** 表示の画像(JPEG) */
  display: Blob;
};

const DISPLAY_JPEG_QUALITY = 0.85;
/**
 * 読み込む画素の数の上限。iOS の Safari は、これを越える canvas を描けない。スマホの 12MP の写真は
 * そのまま読み、大きな写真は JPEG の縮小(下の decodeScale)で収める
 */
const MAX_DECODED_PIXELS = 16_000_000;

type JpegInfo = { width: number; height: number; orientation: number };

/** JPEG のヘッダーから、画素の大きさと EXIF の向き。JPEG でなければ null */
export function readJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const body = offset + 4;
    if (marker === 0xe1 && readAscii(bytes, body, 6) === "Exif\0\0") {
      orientation = readExifOrientation(bytes, body + 6) ?? orientation;
    }
    // SOF(C4・C8・CC は SOF でない)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[body + 1] << 8) | bytes[body + 2];
      const width = (bytes[body + 3] << 8) | bytes[body + 4];
      return { width, height, orientation };
    }
    offset += 2 + length;
  }
  return null;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readExifOrientation(bytes: Uint8Array, tiff: number): number | null {
  const little = readAscii(bytes, tiff, 2) === "II";
  const u16 = (at: number) =>
    little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > bytes.length) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) return null;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return null;
}

/**
 * JPEG を読み込むときに縮める倍率(1・2・4・8 のどれか)。API で使っていた Pillow の draft と同じく、
 * 縦横のどちらも DISPLAY_MAX_PX を割らない倍率でだけ縮める(12MP の写真は縮めない)
 */
export function decodeScale(width: number, height: number): number {
  const most = Math.min(Math.floor(width / DISPLAY_MAX_PX), Math.floor(height / DISPLAY_MAX_PX));
  let scale = 1;
  for (const candidate of [2, 4, 8]) if (candidate <= most) scale = candidate;
  // PNG などで大きすぎる写真は、canvas に描ける大きさまで縮める
  while ((width / scale) * (height / scale) > MAX_DECODED_PIXELS) scale *= 2;
  return scale;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) throw new PhotoUnreadableError("no 2d context");
  return context;
}

async function toJpeg(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: DISPLAY_JPEG_QUALITY });
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", DISPLAY_JPEG_QUALITY),
  );
  if (!blob) throw new PhotoUnreadableError("could not encode the display image");
  return blob;
}

type Decoded = { bitmap: ImageBitmap; width: number; height: number };

/** 向きを直して読み込む。width・height は、向きを直したあとの元の写真の大きさ */
async function decode(blob: Blob): Promise<Decoded> {
  const info = readJpegInfo(new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()));
  try {
    if (info) {
      // 5〜8 は 90 度回す向き
      const turned = info.orientation >= 5 && info.orientation <= 8;
      const width = turned ? info.height : info.width;
      const height = turned ? info.width : info.height;
      const scale = decodeScale(width, height);
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
        ...(scale > 1
          ? {
              resizeWidth: Math.round(width / scale),
              resizeHeight: Math.round(height / scale),
              resizeQuality: "high",
            }
          : {}),
      });
      // 向きを直さずに読む・縮めずに読むブラウザがあっても、縦横の比が合っていれば使える。
      // 縦横が入れ替わっていれば、向きを直せていない
      if ((bitmap.width > bitmap.height) === (width > height) || width === height) {
        return { bitmap, width, height };
      }
      bitmap.close();
    }
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch (e) {
    throw new PhotoUnreadableError(e instanceof Error ? e.message : String(e));
  }
}

/** 読み込んだ画像を RGB の画素にする。大きすぎれば canvas に描ける大きさに縮める */
function pixelsOf(bitmap: ImageBitmap): RgbImage {
  const scale = Math.max(1, Math.sqrt((bitmap.width * bitmap.height) / MAX_DECODED_PIXELS));
  const width = Math.round(bitmap.width / scale);
  const height = Math.round(bitmap.height / scale);
  const canvas = makeCanvas(width, height);
  const context = context2d(canvas);
  context.drawImage(bitmap, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, p = 0; p < data.length; i += 4, p += 3) {
    data[p] = rgba[i];
    data[p + 1] = rgba[i + 1];
    data[p + 2] = rgba[i + 2];
  }
  return { width, height, data };
}

/** 写真を処理する。読めなければ PhotoUnreadableError */
export async function analyzePhotoBlob(blob: Blob, options: AnalyzeOptions): Promise<PhotoAnalysisResult> {
  const { bitmap, width, height } = await decode(blob);
  try {
    const result = analyzePixels(pixelsOf(bitmap), width, options);
    const base = {
      analyzerVersion: ANALYZER_VERSION,
      width,
      height,
      alignmentPoints: options.alignment ? options.alignment.map(([x, y]): Point => [x, y]) : null,
    };
    if (!result.rectified) {
      // 補正できなければ、向きを直して縮めただけの画像にする
      const fit = Math.min(1, DISPLAY_MAX_PX / Math.max(bitmap.width, bitmap.height));
      const canvas = makeCanvas(Math.round(bitmap.width * fit), Math.round(bitmap.height * fit));
      const context = context2d(canvas);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return {
        ...base,
        rectified: false,
        displayExtent: null,
        homography: null,
        estimates: [],
        display: await toJpeg(canvas),
      };
    }
    const canvas = makeCanvas(DISPLAY_MAX_PX, DISPLAY_MAX_PX);
    context2d(canvas).putImageData(new ImageData(result.display, DISPLAY_MAX_PX, DISPLAY_MAX_PX), 0, 0);
    const h = result.homography;
    return {
      ...base,
      rectified: true,
      displayExtent: DISPLAY_EXTENT,
      homography: [
        [h[0], h[1], h[2]],
        [h[3], h[4], h[5]],
        [h[6], h[7], h[8]],
      ],
      estimates: result.estimates.map(({ x, y, confidence }) => ({ x, y, confidence })),
      display: await toJpeg(canvas),
    };
  } finally {
    bitmap.close();
  }
}
