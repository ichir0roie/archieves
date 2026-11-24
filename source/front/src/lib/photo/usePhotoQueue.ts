"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  listGamePhotos,
  photoFileUrl,
  savePhotoAnalysis,
  startDisplayUpload,
  startPhotoUpload,
  uploadPhotoFile,
  type EndPhotoRead,
} from "@/lib/api";
import { useOnResume } from "@/hooks/useOnResume";
import type { ScoreManager } from "@/lib/score/scoreManager";
import { analyzePhoto, PhotoUnreadableError, type AnalyzeOptions } from "./photoAnalysis";
import {
  PHOTO_MAX_BYTES,
  deleteQueuedPhoto,
  listQueuedPhotos,
  putQueuedPhoto,
  toUploadable,
  type QueuedPhoto,
} from "./photoStore";
import { reanalyzeStoredPhoto, toAnalysisWrite } from "./storedPhoto";

/** 画面に出す、エンドの写真の今の状態 */
export type EndPhotoStatus =
  /** 端末で的と矢を探している */
  | "analyzing"
  /** 端末で処理を終え、送るのを待っている */
  | "saved"
  | "uploading"
  /** 送り終え、結果を書いてもらっている */
  | "processing"
  | "processed"
  /** 写真を読めなかった(撮り直してもらう) */
  | "failed"
  /** 送れなかった。画面に戻ったときに送り直す */
  | "sendFailed"
  /** 送り終えたが、結果を書けなかった。画面に戻ったときに書き直す */
  | "processFailed";

/** 写真の処理の結果のうち、画面に要るもの。端末で処理したものと、API から読んだもののどちらでも同じ形 */
export interface PhotoResult {
  /** 表示の画像が、的を正面から見た形に補正したもの */
  rectified: boolean;
  /** 補正した表示の画像が、的に対する割合で -displayExtent から 1 + displayExtent までを写す */
  displayExtent: number | null;
  /** 推測した矢(確からしい順。x・y は的に対する割合) */
  estimates: Array<{ x: number; y: number; confidence: number }>;
}

export interface EndPhotoView {
  status: EndPhotoStatus;
  /** 出す画像。処理を終えるまでは撮った写真、終えれば表示の画像(端末で作ったもの・置き場のもの) */
  imageUrl: string | null;
  /** 処理の結果。処理を終えるまでは null */
  result: PhotoResult | null;
  /** API の写真の行(送り終えた写真)。的を手で合わせ直すのに使う。送り終えるまでは null */
  photo: EndPhotoRead | null;
}

type Stage = "uploading" | "processing" | "sendFailed" | "processFailed";

/** 一枚を流した結果。送り終えていれば、元の写真は置き場に残るので、結果を書けなくても後の写真を送ってよい */
type SendResult = "done" | "skipped" | "notSent" | "notProcessed";

/** 撮った写真を端末に置けなかったわけ。読み込めなかった・大きすぎた */
export type CaptureError = "convertFailed" | "tooLarge";

const RETRY_DELAY_MS = 15_000;

function positionKey(roundIndex: number, endIndex: number) {
  return `${roundIndex}:${endIndex}`;
}

function serverResult(photo: EndPhotoRead): PhotoResult {
  return {
    rectified: photo.rectified,
    displayExtent: photo.display_extent,
    estimates: photo.estimates,
  };
}

/**
 * 写真モードの写真を、撮ってから送り終えるまで運ぶ。
 *
 * 1. 撮ったら端末(IndexedDB)に置き、エンドに写真の印を付ける
 * 2. 端末で的を補正して矢を推測し(photoAnalysis.ts)、結果と表示の画像も端末に置く。推測の印は
 *    この時点で出るので、電波が無くても撮った写真を確かめて次のエンドへ進める
 * 3. 記録を保存してエンドの id を得て、写真を受け付けてもらい、元の写真と表示の画像を置き場へ送り、結果を書く
 * 4. 済んだら端末から消し、ゲームの写真の一覧を読み直す
 *
 * 画面を閉じて途中で止まっても、画面に戻ったとき・電波が戻ったときに続きから流す。
 * saveSheet は記録を API に保存する(エンドの id を得るため)。保存できなければ false
 */
export function usePhotoQueue(
  manager: ScoreManager | null,
  sub: string | null,
  saveSheet: () => Promise<boolean>,
  onManagerChange: () => void,
) {
  const [queued, setQueued] = useState<QueuedPhoto[]>([]);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [serverPhotos, setServerPhotos] = useState<Record<number, EndPhotoRead>>({});
  const [captureError, setCaptureError] = useState<CaptureError | null>(null);
  const objectUrls = useRef(new Map<Blob, string>());
  const queuedRef = useRef<QueuedPhoto[]>([]);
  queuedRef.current = queued;
  const retryTimer = useRef<number | null>(null);
  const running = useRef(false);
  // 流している間に撮った写真も、続けて流す
  const again = useRef(false);
  // 端末で処理している写真(同じ写真を二度処理しない)
  const analyzing = useRef(new Map<string, Promise<void>>());
  // 置き場にあって結果の無い写真を、処理し直している(同じ写真を二度処理しない)
  const reanalyzing = useRef(new Set<number>());
  const latest = useRef({ manager, sub, saveSheet });
  latest.current = { manager, sub, saveSheet };

  const enabled = manager !== null && manager.photoPhase !== null && sub !== null;

  function objectUrl(blob: Blob): string {
    let url = objectUrls.current.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      objectUrls.current.set(blob, url);
    }
    return url;
  }

  function setStage(id: string, stage: Stage | null) {
    setStages((current) => {
      const next = { ...current };
      if (stage === null) delete next[id];
      else next[id] = stage;
      return next;
    });
  }

  function analyzeOptions(): AnalyzeOptions {
    const setup = latest.current.manager?.gameSetup;
    // 同じ的に刺さったほかの人の矢と見分けるよう、ゲームの矢の色で探す
    return {
      nockColor: setup?.nockColor ?? null,
      fletchColor: setup?.fletchColor ?? null,
      alignment: null,
    };
  }

  async function reloadQueued(): Promise<QueuedPhoto[]> {
    const { manager: m, sub: s } = latest.current;
    if (!m || !s) return [];
    const photos = await listQueuedPhotos(s, m.photoQueueKey);
    setQueued(photos);
    return photos;
  }

  async function refreshServerPhotos() {
    const m = latest.current.manager;
    if (!m || m.gameId === null) return;
    let photos: EndPhotoRead[];
    try {
      photos = await listGamePhotos(m.gameId);
    } catch {
      // 読めなければ前の結果のまま。画面に戻ったときに読み直す
      return;
    }
    setServerPhotos(Object.fromEntries(photos.map((photo) => [photo.end_id, photo])));
    // 送り終えたのに結果を書けていない写真(別の端末で撮った・この端末の控えが消えた)は、置き場の元の写真を処理し直す
    const queuedIds = new Set(queuedRef.current.map((photo) => photo.uploadedPhotoId));
    for (const photo of photos) {
      if (photo.status !== "uploading" || queuedIds.has(photo.id) || reanalyzing.current.has(photo.id)) continue;
      reanalyzing.current.add(photo.id);
      reanalyzeStoredPhoto(photo, analyzeOptions())
        .then((processed) => setServerPhotos((current) => ({ ...current, [processed.end_id]: processed })))
        .catch(() => {
          // 置き場に届いていない・電波が無い・読めない写真。次に読み直したときにまた試す
        })
        .finally(() => reanalyzing.current.delete(photo.id));
    }
  }

  /** 端末に置いた写真を処理し、結果と表示の画像を端末に置き直す。済んでいれば何もしない */
  function ensureAnalyzed(photo: QueuedPhoto): Promise<void> {
    if (photo.analysis || photo.unreadable) return Promise.resolve();
    let running = analyzing.current.get(photo.id);
    if (!running) {
      running = (async () => {
        let next: QueuedPhoto;
        try {
          const { display, ...analysis } = await analyzePhoto(photo.blob, analyzeOptions());
          next = { ...photo, analysis, display };
        } catch (e) {
          if (!(e instanceof PhotoUnreadableError)) throw e;
          next = { ...photo, unreadable: true };
        }
        // 処理の間に撮り直していたら、消えた写真を置き直さない
        const { sub: s, manager: m } = latest.current;
        if (!s || !m) return;
        const current = await listQueuedPhotos(s, m.photoQueueKey);
        if (current.some((p) => p.id === photo.id)) await putQueuedPhoto(next);
      })().finally(() => analyzing.current.delete(photo.id));
      analyzing.current.set(photo.id, running);
    }
    return running;
  }

  async function send(photo: QueuedPhoto): Promise<SendResult> {
    const { manager: m, saveSheet: save } = latest.current;
    if (!m) return "notSent";
    if (photo.unreadable || !photo.analysis || !photo.display) return "skipped";
    let photoId = photo.uploadedPhotoId;
    let displayKey = photo.displayKey ?? null;
    if (photoId === null) {
      let endId = m.endIdAt(photo.roundIndex, photo.endIndex);
      if (endId === null || m.hasUnsavedChanges) {
        if (!(await save())) return "notSent";
        endId = m.endIdAt(photo.roundIndex, photo.endIndex);
      }
      if (endId === null) {
        // 写真のエンドが記録から無くなった(設定でエンドを減らしたなど)。送る先が無いので捨てる
        await deleteQueuedPhoto(photo.id);
        return "done";
      }
      setStage(photo.id, "uploading");
      const started = await startPhotoUpload(endId, photo.contentType, photo.blob.size, photo.display.size);
      await uploadPhotoFile(started.upload_url, started.upload_headers, photo.blob);
      await uploadPhotoFile(started.display.upload_url, started.display.upload_headers, photo.display);
      photoId = started.photo.id;
      displayKey = started.display.display_key;
      await putQueuedPhoto({ ...photo, uploadedPhotoId: photoId, displayKey });
    } else if (displayKey === null) {
      // 元の写真だけを送り終えていた(表示の画像を API が作っていたころに送った写真)
      setStage(photo.id, "uploading");
      const target = await startDisplayUpload(photoId, photo.display.size);
      await uploadPhotoFile(target.upload_url, target.upload_headers, photo.display);
      displayKey = target.display_key;
      await putQueuedPhoto({ ...photo, displayKey });
    }
    setStage(photo.id, "processing");
    try {
      const processed = await savePhotoAnalysis(photoId, toAnalysisWrite(photo.analysis, displayKey));
      setServerPhotos((current) => ({ ...current, [processed.end_id]: processed }));
    } catch (e) {
      // 送ったはずの写真が置き場に無い。次は送り直す
      if (e instanceof ApiError && e.status === 409) {
        await putQueuedPhoto({ ...photo, uploadedPhotoId: null, displayKey: null });
        return "notSent";
      }
      return "notProcessed";
    }
    await deleteQueuedPhoto(photo.id);
    return "done";
  }

  /** 送れなかったら、画面を開いている間は少しおいて送り直す(保存の途中だった・電波が弱かった) */
  function scheduleRetry() {
    if (retryTimer.current !== null) return;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      if (document.visibilityState === "visible") void pump();
    }, RETRY_DELAY_MS);
  }

  /**
   * 端末に置いた写真を、撮った順に処理して送る。一枚でも送れなければそこで止め、次の機会に続きから流す。
   * 送り終えて結果だけを書けなかった写真・読めなかった写真では止めず、後の写真を送る
   */
  async function pump() {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        for (const queuedPhoto of await reloadQueued()) {
          let photo = queuedPhoto;
          if (!photo.analysis && !photo.unreadable) {
            try {
              await ensureAnalyzed(photo);
            } catch {
              // 処理できなかった(メモリ切れなど)。次の機会に処理し直す
              scheduleRetry();
              return;
            }
            const reloaded = (await reloadQueued()).find((p) => p.id === photo.id);
            if (!reloaded) continue;
            photo = reloaded;
          }
          let result: SendResult;
          try {
            result = await send(photo);
          } catch {
            result = "notSent";
          }
          if (result === "done") {
            setStage(photo.id, null);
            continue;
          }
          if (result === "skipped") continue;
          scheduleRetry();
          if (result === "notProcessed") {
            setStage(photo.id, "processFailed");
            continue;
          }
          setStage(photo.id, "sendFailed");
          return;
        }
      } while (again.current);
      await reloadQueued();
      await refreshServerPhotos();
    } finally {
      running.current = false;
    }
  }

  /** 今のエンドの写真を撮った。端末に置き、エンドに印を付けて、処理して送り始める */
  async function capture(file: File) {
    const { manager: m, sub: s } = latest.current;
    if (!m || !s) return;
    const uploadable = await toUploadable(file);
    if (!uploadable) {
      setCaptureError("convertFailed");
      return;
    }
    if (uploadable.blob.size > PHOTO_MAX_BYTES) {
      setCaptureError("tooLarge");
      return;
    }
    setCaptureError(null);
    const { roundIndex, endIndex } = m.position;
    // 送る前に撮り直したら、前の写真は送らない
    for (const photo of queued) {
      if (positionKey(photo.roundIndex, photo.endIndex) === positionKey(roundIndex, endIndex)) {
        await deleteQueuedPhoto(photo.id);
      }
    }
    await putQueuedPhoto({
      id: crypto.randomUUID(),
      sub: s,
      gameKey: m.photoQueueKey,
      roundIndex,
      endIndex,
      blob: uploadable.blob,
      contentType: uploadable.contentType,
      takenAt: new Date().toISOString(),
      analysis: null,
      display: null,
      unreadable: false,
      uploadedPhotoId: null,
      displayKey: null,
    });
    m.markPhoto();
    onManagerChange();
    await reloadQueued();
    void pump();
  }

  // 開いたとき、画面に戻ったとき、電波が戻ったときに、残っている写真を流して結果を読み直す
  useEffect(() => {
    if (!enabled) return;
    void refreshServerPhotos();
    void pump();
    const onOnline = () => void pump();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // 開いたときに一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useOnResume(() => {
    if (!enabled) return;
    void refreshServerPhotos();
    void pump();
  });

  // 端末の写真の URL は、要らなくなったら返す
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);

  /** 今のエンドの写真。撮っていなければ null */
  function currentView(): EndPhotoView | null {
    if (!manager || !enabled) return null;
    const { roundIndex, endIndex } = manager.position;
    const local = [...queued]
      .reverse()
      .find((photo) => photo.roundIndex === roundIndex && photo.endIndex === endIndex);
    if (local) {
      const status: EndPhotoStatus = local.unreadable
        ? "failed"
        : !local.analysis
          ? "analyzing"
          : (stages[local.id] ?? "saved");
      return {
        status,
        imageUrl: objectUrl(local.display ?? local.blob),
        result: local.analysis
          ? {
              rectified: local.analysis.rectified,
              displayExtent: local.analysis.displayExtent,
              estimates: local.analysis.estimates,
            }
          : null,
        photo: null,
      };
    }
    const endId = manager.currentEndId;
    const server = endId === null ? undefined : serverPhotos[endId];
    if (!server) return null;
    const processed = server.status === "processed";
    return {
      status: processed ? "processed" : server.status === "failed" ? "failed" : "processing",
      imageUrl: server.display_url ? photoFileUrl(server.display_url) : null,
      result: processed ? serverResult(server) : null,
      photo: server,
    };
  }

  /** 処理し直した写真(手で合わせたものなど)を、画面に出す結果へ写す */
  function replacePhoto(photo: EndPhotoRead) {
    setServerPhotos((current) => ({ ...current, [photo.end_id]: photo }));
  }

  /** 置き場の写真を、手で合わせた 4 点で処理し直す。できたら処理し直した写真 */
  async function realign(photo: EndPhotoRead, points: Array<[number, number]>): Promise<EndPhotoRead> {
    const processed = await reanalyzeStoredPhoto(photo, { ...analyzeOptions(), alignment: points });
    replacePhoto(processed);
    return processed;
  }

  return {
    current: currentView(),
    /** 送るのを待っている写真の数(読めなかった写真は送らないので数えない) */
    pendingCount: queued.filter((photo) => !photo.unreadable).length,
    captureError,
    capture,
    realign,
  };
}
