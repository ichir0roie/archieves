/**
 * 写真モードの写真の処理(的の補正と矢の推測)を、ブラウザで行う。
 *
 * 撮ったその場で処理して推測の印を出し、電波が無くても次のエンドへ進めるようにする。処理は重い
 * (12MP の写真で数秒)ので Web Worker で回し、Worker を使えないブラウザでは画面の側で回す。
 * API には、元の写真・表示の画像と一緒に結果を送り、置いてもらうだけにする。
 */

import type { AnalyzeOptions } from "./vision/analyze";
import { analyzePhotoBlob, PhotoUnreadableError, type PhotoAnalysisResult } from "./vision/decode";

export { PhotoUnreadableError, type PhotoAnalysisResult };
export type { AnalyzeOptions };

export type AnalysisRequest = { blob: Blob; options: AnalyzeOptions };
export type AnalysisResponse =
  | { ok: true; result: PhotoAnalysisResult }
  | { ok: false; unreadable: boolean; message: string };

function runInWorker(request: AnalysisRequest): Promise<AnalysisResponse> | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./photoAnalysis.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "photo worker failed"));
    };
    worker.postMessage(request);
  });
}

/**
 * 写真を処理する。読めない写真は PhotoUnreadableError。
 * 一枚ずつ Worker を起こして終わったら閉じる(写真は数十秒に一枚なので、起こす手間は小さい)
 */
export async function analyzePhoto(blob: Blob, options: AnalyzeOptions): Promise<PhotoAnalysisResult> {
  let response: AnalysisResponse | null = null;
  try {
    response = await runInWorker({ blob, options });
  } catch {
    // Worker の中で OffscreenCanvas などが使えなかった。画面の側でやり直す
    response = null;
  }
  if (response === null) return analyzePhotoBlob(blob, options);
  if (response.ok) return response.result;
  if (response.unreadable) throw new PhotoUnreadableError(response.message);
  // 読めないのでなく Worker で処理できなかった(OffscreenCanvas が無いなど)。画面の側でやり直す
  return analyzePhotoBlob(blob, options);
}
