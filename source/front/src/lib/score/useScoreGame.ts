"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreManager, type ScoreProgress } from "@/lib/score/scoreManager";
import { type SheetPoint } from "@/lib/score/scoreSheetCache";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";
import { type CommentTarget } from "@/lib/comment";

/** The notes shown on the entry screen: the game's, and the round/end in progress. */
export interface ScoreComments {
  game: string | null;
  round: string | null;
  end: string | null;
}

/**
 * 点数の入力の画面の、ゲーム・ラウンド・エンド・矢の流れ。記録は手元のキャッシュにだけ書き
 * (ScoreManager)、API には保存・終了のときに一度に送る。キャッシュが無ければ(ゲームを始めずに
 * 開いた)ホームへ戻す。
 */
export function useScoreGame() {
  const router = useRouter();
  const [manager, setManager] = useState<ScoreManager | null>(null);
  const [mirrorPoints, setMirrorPoints] = useState<Array<SheetPoint>>([]);
  const [progress, setProgress] = useState<ScoreProgress | null>(null);
  const [comments, setComments] = useState<ScoreComments>({
    game: null,
    round: null,
    end: null,
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // isSaving は画面用。閉じ込められた古い値を見て二つ目の保存が通ることがあるので、
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
    setHasUnsavedChanges(scoreManager.hasUnsavedChanges);
  }

  useEffect(() => {
    const scoreManager = ScoreManager.resume();
    if (!scoreManager) {
      router.replace("/");
      return;
    }
    setManager(scoreManager);
    syncFrom(scoreManager);
    // 開いたときに一度だけキャッシュから読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 手元だけで済む操作。保存の途中は記録を変えない(応答の id を同じ位置に当てるため) */
  function act(action: (scoreManager: ScoreManager) => void) {
    if (!manager || inFlight.current) return;
    action(manager);
    syncFrom(manager);
  }

  async function sendToApi(action: (scoreManager: ScoreManager) => Promise<void>): Promise<boolean> {
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

  function next(point: number, x: number = 0, y: number = 0) {
    act((scoreManager) => scoreManager.addPoint(point, x, y));
  }

  function backPoint() {
    act((scoreManager) => scoreManager.removePoint());
  }

  function forwardPoint() {
    act((scoreManager) => scoreManager.restorePoint());
  }

  function backEnd() {
    act((scoreManager) => scoreManager.goBackEnd());
  }

  function forwardEnd() {
    act((scoreManager) => scoreManager.goForwardEnd());
  }

  // CommentBar のモーダルは書けたかを待つので、Promise で返す。手元に書くだけなので失敗しない
  async function saveComment(target: CommentTarget, body: string) {
    act((scoreManager) => scoreManager.saveComment(target, body));
  }

  async function save() {
    await sendToApi((scoreManager) => scoreManager.save());
  }

  // 保存が失敗したら画面に残る(キャッシュも残るので、もう一度押せる)
  async function finish() {
    await sendToApi(async (scoreManager) => {
      const gameId = await scoreManager.finish();
      if (gameId === null) {
        router.replace("/");
        return;
      }
      const params = new URLSearchParams();
      params.set("gameId", String(gameId));
      router.push(`/score-view/?${params.toString()}`);
    });
  }

  return {
    manager,
    mirrorPoints,
    progress,
    comments,
    hasUnsavedChanges,
    saveComment,
    next,
    backPoint,
    forwardPoint,
    backEnd,
    forwardEnd,
    save,
    finish,
    error,
    isSaving,
  };
}
