"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  listGamePhotos,
  photoFileUrl,
  processPhoto,
  startPhotoUpload,
  uploadPhotoFile,
  type EndPhotoRead,
} from "@/lib/api";
import { useOnResume } from "@/hooks/useOnResume";
import type { ScoreManager } from "@/lib/score/scoreManager";
import {
  PHOTO_MAX_BYTES,
  deleteQueuedPhoto,
  listQueuedPhotos,
  putQueuedPhoto,
  toUploadable,
  type QueuedPhoto,
} from "./photoStore";

/** 画面に出す、エンドの写真の今の状態 */
export type EndPhotoStatus =
  /** 端末に置いて、送るのを待っている */
  | "saved"
  | "uploading"
  | "processing"
  | "processed"
  /** 写真を読めなかった(撮り直してもらう) */
  | "failed"
  /** 送れなかった。画面に戻ったときに送り直す */
  | "sendFailed";

export interface EndPhotoView {
  status: EndPhotoStatus;
  /** 出す画像。送り終えるまでは端末の写真、処理が済めば表示の画像 */
  imageUrl: string | null;
  /** 処理の結果。処理が済むまでは null */
  photo: EndPhotoRead | null;
}

type Stage = "saved" | "uploading" | "processing" | "sendFailed";

/** 撮った写真を端末に置けなかったわけ。読み込めなかった・大きすぎた */
export type CaptureError = "convertFailed" | "tooLarge";

const RETRY_DELAY_MS = 15_000;

function positionKey(roundIndex: number, endIndex: number) {
  return `${roundIndex}:${endIndex}`;
}

/**
 * 写真モードの写真を、撮ってから処理が済むまで運ぶ。
 *
 * 1. 撮ったら端末(IndexedDB)に置き、エンドに写真の印を付ける
 * 2. 記録を保存してエンドの id を得て、写真を受け付けてもらい、置き場へ送り、処理を頼む
 * 3. 済んだら端末から消し、処理の結果(ゲームの写真の一覧)を読み直す
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
  const objectUrls = useRef(new Map<string, string>());
  const queuedRef = useRef<QueuedPhoto[]>([]);
  queuedRef.current = queued;
  const retryTimer = useRef<number | null>(null);
  const running = useRef(false);
  // 流している間に撮った写真も、続けて流す
  const again = useRef(false);
  const latest = useRef({ manager, sub, saveSheet });
  latest.current = { manager, sub, saveSheet };

  const enabled = manager !== null && manager.photoPhase !== null && sub !== null;

  function objectUrl(photo: QueuedPhoto): string {
    let url = objectUrls.current.get(photo.id);
    if (!url) {
      url = URL.createObjectURL(photo.blob);
      objectUrls.current.set(photo.id, url);
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
    // 送り終えたのに処理を頼めていない写真(別の端末で撮った・この端末の控えが消えた)は、ここで頼む
    const queuedIds = new Set(queuedRef.current.map((photo) => photo.uploadedPhotoId));
    for (const photo of photos) {
      if (photo.status !== "uploading" || queuedIds.has(photo.id)) continue;
      processPhoto(photo.id).then(
        (processed) => setServerPhotos((current) => ({ ...current, [processed.end_id]: processed })),
        () => {
          // 置き場に届いていない(409)・電波が無い。次に読み直したときにまた頼む
        },
      );
    }
  }

  async function send(photo: QueuedPhoto): Promise<boolean> {
    const { manager: m, saveSheet: save } = latest.current;
    if (!m) return false;
    let photoId = photo.uploadedPhotoId;
    if (photoId === null) {
      let endId = m.endIdAt(photo.roundIndex, photo.endIndex);
      if (endId === null || m.hasUnsavedChanges) {
        if (!(await save())) return false;
        endId = m.endIdAt(photo.roundIndex, photo.endIndex);
      }
      if (endId === null) {
        // 写真のエンドが記録から無くなった(設定でエンドを減らしたなど)。送る先が無いので捨てる
        await deleteQueuedPhoto(photo.id);
        return true;
      }
      setStage(photo.id, "uploading");
      const started = await startPhotoUpload(endId, photo.contentType, photo.blob.size);
      await uploadPhotoFile(started.upload_url, started.upload_headers, photo.blob);
      photoId = started.photo.id;
      await putQueuedPhoto({ ...photo, uploadedPhotoId: photoId });
    }
    setStage(photo.id, "processing");
    try {
      const processed = await processPhoto(photoId);
      setServerPhotos((current) => ({ ...current, [processed.end_id]: processed }));
    } catch (e) {
      // 送ったはずの写真が置き場に無い。次は送り直す
      if (e instanceof ApiError && e.status === 409) {
        await putQueuedPhoto({ ...photo, uploadedPhotoId: null });
      }
      throw e;
    }
    await deleteQueuedPhoto(photo.id);
    return true;
  }

  /** 送れなかったら、画面を開いている間は少しおいて送り直す(保存の途中だった・電波が弱かった) */
  function scheduleRetry() {
    if (retryTimer.current !== null) return;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      if (document.visibilityState === "visible") void pump();
    }, RETRY_DELAY_MS);
  }

  /** 端末に置いた写真を、撮った順に送る。一枚でも送れなければそこで止め、次の機会に続きから流す */
  async function pump() {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        for (const photo of await reloadQueued()) {
          let sent = false;
          try {
            sent = await send(photo);
          } catch {
            sent = false;
          }
          if (!sent) {
            setStage(photo.id, "sendFailed");
            scheduleRetry();
            return;
          }
          setStage(photo.id, null);
        }
      } while (again.current);
      await reloadQueued();
      await refreshServerPhotos();
    } finally {
      running.current = false;
    }
  }

  /** 今のエンドの写真を撮った。端末に置き、エンドに印を付けて送り始める */
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
      uploadedPhotoId: null,
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
      return {
        status: stages[local.id] ?? "saved",
        imageUrl: objectUrl(local),
        photo: null,
      };
    }
    const endId = manager.currentEndId;
    const server = endId === null ? undefined : serverPhotos[endId];
    if (!server) return null;
    return {
      status: server.status === "processed" ? "processed" : server.status === "failed" ? "failed" : "processing",
      imageUrl: server.display_url ? photoFileUrl(server.display_url) : null,
      photo: server,
    };
  }

  /** 処理し直した写真(手で合わせたものなど)を、画面に出す結果へ写す */
  function replacePhoto(photo: EndPhotoRead) {
    setServerPhotos((current) => ({ ...current, [photo.end_id]: photo }));
  }

  return {
    current: currentView(),
    pendingCount: queued.length,
    captureError,
    capture,
    replacePhoto,
  };
}
