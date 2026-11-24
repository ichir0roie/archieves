/**
 * 置き場にある写真を、ブラウザで処理し直して結果を API に書く。
 *
 * - 手で的を合わせ直したとき(4 点で補正し直す)
 * - 元の写真を送り終えたのに結果を書けていない写真(別の端末で撮った・端末の控えが消えた・
 *   API が写真を処理していたころに送った)
 */

import {
  downloadPhotoFile,
  savePhotoAnalysis,
  startDisplayUpload,
  uploadPhotoFile,
  type EndPhotoRead,
  type PhotoAnalysisWrite,
} from "@/lib/api";
import { analyzePhoto, type AnalyzeOptions, type PhotoAnalysisResult } from "./photoAnalysis";

/** 処理の結果を、API に書く形にする(表示の画像は送ったキーで指す) */
export function toAnalysisWrite(result: Omit<PhotoAnalysisResult, "display">, displayKey: string): PhotoAnalysisWrite {
  return {
    display_key: displayKey,
    analyzer_version: result.analyzerVersion,
    width: result.width,
    height: result.height,
    rectified: result.rectified,
    display_extent: result.displayExtent,
    homography: result.homography,
    estimates: result.estimates,
    alignment_points: result.alignmentPoints,
  };
}

/** 置き場の元の写真を処理し、表示の画像を送って、結果を書く */
export async function reanalyzeStoredPhoto(photo: EndPhotoRead, options: AnalyzeOptions): Promise<EndPhotoRead> {
  const original = await downloadPhotoFile(photo.original_url);
  const result = await analyzePhoto(original, options);
  const target = await startDisplayUpload(photo.id, result.display.size);
  await uploadPhotoFile(target.upload_url, target.upload_headers, result.display);
  return savePhotoAnalysis(photo.id, toAnalysisWrite(result, target.display_key));
}
