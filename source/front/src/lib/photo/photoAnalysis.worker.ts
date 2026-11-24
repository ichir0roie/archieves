/// <reference lib="webworker" />
/**
 * 写真の処理を、画面を止めずに裏で回す Web Worker。呼ぶ側は photoAnalysis.ts
 */

import { analyzePhotoBlob, PhotoUnreadableError } from "./vision/decode";
import type { AnalysisRequest, AnalysisResponse } from "./photoAnalysis";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  let response: AnalysisResponse;
  try {
    response = { ok: true, result: await analyzePhotoBlob(event.data.blob, event.data.options) };
  } catch (e) {
    response = {
      ok: false,
      unreadable: e instanceof PhotoUnreadableError,
      message: e instanceof Error ? e.message : String(e),
    };
  }
  scope.postMessage(response);
};
