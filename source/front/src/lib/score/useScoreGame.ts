"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScoreManager,
  type ScoreProgress,
} from "@/lib/score/scoreManager";
import {
  ApiError,
  toErrorDetails,
  type ErrorDetails,
  type PointRead,
} from "@/lib/api";
import { type RoundSetup } from "@/lib/score/scoreConfig";
import { type CommentTarget } from "@/lib/comment";
import {
  clearGameId,
  clearNewGameStart,
  hasNewGameStart,
  loadGameId,
  loadRoundSetup,
} from "@/lib/storage";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { getT } from "@/lib/text";
import { useRunOnce } from "@/lib/useRunOnce";

/** The notes shown on the entry screen: the game's, and the round/end in progress. */
export interface ScoreComments {
  game: string | null;
  round: string | null;
  end: string | null;
}

let setupInFlight: Promise<ScoreManager> | null = null;

/** 裏の書き込みが失敗している間、書き直しを試す間隔 */
const RETRY_INTERVAL_MS = 15_000;

/**
 * スマホで画面を消す・アプリを切り替えると、書いている途中の fetch が切られる(Failed to fetch)。
 * 書いていない分は残っていて書き直せば済むので、fetch の文言でなく、どうなるかを出す
 */
function toBackgroundErrorDetails(e: unknown): ErrorDetails {
  if (e instanceof ApiError) return toErrorDetails(e);
  return {
    message: getT().game.entry.unsent,
    body: e instanceof Error ? e.message : undefined,
  };
}

function setupOrResumeGame(
  userId: number,
  setup: RoundSetup | null
): Promise<ScoreManager> {
  if (setupInFlight === null) {
    setupInFlight = (async () => {
      const scoreManager = new ScoreManager(loadGameId(), userId, setup);
      await scoreManager.setupGame();
      return scoreManager;
    })().finally(() => {
      setupInFlight = null;
    });
  }
  return setupInFlight;
}

/**
 * 点数の入力の画面の、ゲーム・ラウンド・エンド・矢の流れ。新しいゲームは設定の画面で選んだ
 * 距離・的・矢数・エンド数・ラウンド数(loadRoundSetup)を使い、続きのゲームはラウンドが持つ値を使う。
 */
export function useScoreGame() {
  const router = useRouter();
  const [manager, setManager] = useState<ScoreManager | null>(null);
  const [mirrorPoints, setMirrorPoints] = useState<Array<PointRead>>([]);
  const [progress, setProgress] = useState<ScoreProgress | null>(null);
  const [comments, setComments] = useState<ScoreComments>({
    game: null,
    round: null,
    end: null,
  });
  const [error, setError] = useState<ErrorDetails | null>(null);
  // 操作の失敗(error)と分けて持ち、書き直せたら消す
  const [backgroundError, setBackgroundError] = useState<ErrorDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  // isSaving は画面用。閉じ込められた古い値を見て二つ目の操作が通ることがあるので、
  // 重なりの防止はこちらで判定する
  const inFlight = useRef(false);

  // manager は可変で同じ参照のままなので、変えるたびに中身を React の状態へ写す
  function syncFrom(scoreManager: ScoreManager) {
    setMirrorPoints([...scoreManager.currentPoints]);
    setProgress(scoreManager.progress);
    setComments({
      game: scoreManager.gameComment,
      round: scoreManager.roundComment,
      end: scoreManager.endComment,
    });
  }

  async function setupGame() {
    // Only /game/setup is allowed to start a brand-new game. Landing here
    // any other way (browser back, a stale tab, a direct link) with no
    // game already in progress must not silently create one.
    if (!loadGameId() && !hasNewGameStart()) {
      router.replace("/");
      return;
    }

    setError(null);
    setIsSettingUp(true);
    try {
      const { id: userId } = await getCurrentAppUser();
      const scoreManager = await setupOrResumeGame(userId, loadRoundSetup());
      // エンドを動かしたあとの書き込みは裏で流れるので、失敗はここで画面に出す
      scoreManager.onBackgroundError = (e) => setBackgroundError(toBackgroundErrorDetails(e));
      scoreManager.onBackgroundSaved = () => setBackgroundError(null);
      setManager(scoreManager);
      syncFrom(scoreManager);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setIsSettingUp(false);
    }
  }

  // 書き込みが済む前にタブを閉じる・読み込み直すと、まだ API に届いていない矢が失われる
  useEffect(() => {
    if (!manager) return;
    function confirmLeave(event: BeforeUnloadEvent) {
      if (!manager?.hasUnsavedWrites) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [manager]);

  // 裏の書き込みが失敗したら、エンドを動かすのを待たずに、画面に戻った・通信が戻った・一定の間隔で書き直す
  useEffect(() => {
    if (!manager || !backgroundError) return;
    function retryUnsaved() {
      if (document.visibilityState === "visible") manager?.retryUnsaved();
    }
    document.addEventListener("visibilitychange", retryUnsaved);
    window.addEventListener("online", retryUnsaved);
    const timer = window.setInterval(retryUnsaved, RETRY_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", retryUnsaved);
      window.removeEventListener("online", retryUnsaved);
      window.clearInterval(timer);
    };
  }, [manager, backgroundError]);

  const { runOnMount, run: retrySetupGame } = useRunOnce(setupGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  // ボタンの onClick はこの async 関数を待たないので、失敗はここで受けてエラーの表示にする。
  // ScoreManager は API が成功した所までしか状態を変えないので、失敗しても今の中身を写せば
  // 画面と db は食い違わない
  async function run(action: (scoreManager: ScoreManager) => Promise<void>): Promise<boolean> {
    if (!manager || inFlight.current) return false;

    inFlight.current = true;
    setIsSaving(true);
    try {
      await action(manager);
      setError(null);
      return true;
    } catch (e) {
      setError(toErrorDetails(e));
      return false;
    } finally {
      syncFrom(manager);
      inFlight.current = false;
      setIsSaving(false);
    }
  }

  async function next(point: number, x: number = 0, y: number = 0) {
    await run(async (scoreManager) => {
      await scoreManager.addPoint(point, x, y);
    });
  }

  async function backPoint() {
    await run(async (scoreManager) => {
      await scoreManager.removePoint();
    });
  }

  async function forwardPoint() {
    await run(async (scoreManager) => {
      await scoreManager.restorePoint();
    });
  }

  async function backEnd() {
    await run(async (scoreManager) => {
      await scoreManager.goBackEnd();
    });
  }

  async function forwardEnd() {
    await run(async (scoreManager) => {
      await scoreManager.goForwardEnd();
    });
  }

  // 矢と違ってモーダルから呼ばれ、書けたかどうかを知る必要がある。失敗したら入力した文字を
  // 画面に残すため、例外にして返す
  async function saveComment(target: CommentTarget, body: string) {
    const saved = await run(async (scoreManager) => {
      await scoreManager.saveComment(target, body);
    });
    if (!saved) throw new Error("コメントを保存できませんでした。");
  }

  // run() を通すことで、前の書き込みが途中・失敗のまま /score-view へ移って、入れたはずの矢が
  // 無いスコア表を見せることを防ぐ
  async function finish() {
    await run(async (scoreManager) => {
      const hasScores = await scoreManager.discardEmptyTail();
      clearGameId();
      clearNewGameStart();
      if (!hasScores || !scoreManager.gameId) {
        router.replace("/");
        return;
      }
      const params = new URLSearchParams();
      params.set("gameId", scoreManager.gameId);
      router.push(`/score-view/?${params.toString()}`);
    });
  }

  return {
    manager,
    mirrorPoints,
    progress,
    comments,
    saveComment,
    next,
    backPoint,
    forwardPoint,
    backEnd,
    forwardEnd,
    finish,
    error: error ?? backgroundError,
    isSaving,
    isSettingUp,
    retry: retrySetupGame,
  };
}
