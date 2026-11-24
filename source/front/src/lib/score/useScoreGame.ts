"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreManager, type ScoreProgress } from "@/lib/score/scoreManager";
import { type SheetPoint } from "@/lib/score/scoreSheetCache";
import { toErrorDetails, type EndPhotoRead, type ErrorDetails } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { type CommentTarget } from "@/lib/comment";
import { type RoundSetup } from "@/lib/score/scoreConfig";
import { matchPath } from "@/lib/score/match";
import { scoreAtPosition, isInnerTenBow } from "@/lib/score/scoreFunctions";
import { usePhotoQueue } from "@/lib/photo/usePhotoQueue";

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
 *
 * beforeLeave は、終了の保存が済んで画面を離れる直前に呼ぶ(離れるときの確認を外す)。
 */
export function useScoreGame(beforeLeave: () => void) {
  const router = useRouter();
  const [manager, setManager] = useState<ScoreManager | null>(null);
  // 写真を端末に置くときの持ち主(ログインの sub)
  const [sub, setSub] = useState<string | null>(null);
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
  // 終了の送信から画面を離れるまで覆いを出す。送れたあとも、スコアの画面に替わるまでは残す
  const [isFinishing, setIsFinishing] = useState(false);
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
    let cancelled = false;
    getCurrentUser().then(
      ({ userId }) => {
        if (cancelled) return;
        const scoreManager = ScoreManager.resume(userId);
        if (!scoreManager) {
          router.replace("/");
          return;
        }
        setSub(userId);
        setManager(scoreManager);
        syncFrom(scoreManager);
      },
      () => {
        if (!cancelled) router.replace("/");
      },
    );
    return () => {
      cancelled = true;
    };
    // 開いたときに一度だけキャッシュから読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 終了の保存が済んだら待たずにスコアの画面へ替われるよう、先に読んでおく
  useEffect(() => {
    router.prefetch("/score-view");
  }, [router]);

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

  // 写真モード: 写真を送るときに記録を保存してエンドの id を得る。入力の保存と重なれば、次の機会に回す
  const photos = usePhotoQueue(
    manager,
    sub,
    () => sendToApi((scoreManager) => scoreManager.save()),
    () => manager && syncFrom(manager),
  );

  // 補正: 矢の無いエンドを開いたら、写真の推測を矢として入れる(人が直す下書き)。推測は端末で
  // 処理したものなので、写真を送り終えていなくても入れる
  const estimates = photos.current?.result?.estimates;
  // 撮ったエンドのまま補正を始めたとき(エンドの位置が変わらない)にも入れる
  const photoPhase = manager?.photoPhase ?? null;
  useEffect(() => {
    if (!manager || manager.photoPhase !== "review" || !estimates || estimates.length === 0) return;
    if (inFlight.current) return;
    const rules = {
      arrowRatio: manager.arrowRatio,
      allIn: manager.allIn,
      innerTen: isInnerTenBow(manager.bowType),
    };
    manager.applyEstimates(
      estimates.map(({ x, y }) => ({ score: scoreAtPosition(x, y, rules), x, y })),
    );
    syncFrom(manager);
    // エンドを動かしたとき・推測が届いたとき・補正を始めたときに確かめる
  }, [manager, photoPhase, estimates, progress?.roundNumber, progress?.endNumber]);

  function next(point: number, x: number | null, y: number | null) {
    act((scoreManager) => scoreManager.addPoint(point, x, y));
  }

  function movePoint(index: number, point: number, x: number, y: number) {
    act((scoreManager) => scoreManager.movePoint(index, point, x, y));
  }

  /**
   * 写真モード: 今のエンドの写真の的を、手で合わせた 4 点で補正し直す。replace なら、このエンドの矢を
   * 外して、補正し直した推測を入れ直す。できたら true
   */
  async function alignPhoto(photo: EndPhotoRead, points: Array<[number, number]>, replace: boolean) {
    try {
      await photos.realign(photo, points);
    } catch {
      return false;
    }
    if (replace) act((scoreManager) => scoreManager.resetEstimates());
    return true;
  }

  /** 写真モード: 撮るのを終えて、記録を保存してから最初のエンドから補正を始める */
  async function startPhotoReview() {
    if (!manager) return;
    await sendToApi((scoreManager) => scoreManager.save());
    act((scoreManager) => scoreManager.startPhotoReview());
  }

  function backPoint() {
    act((scoreManager) => scoreManager.removePoint());
  }

  /** 今のエンドの index 番目の矢を外す(写真モードの補正で、推測が拾った矢でないものを外す) */
  function removePointAt(index: number) {
    act((scoreManager) => scoreManager.removePointAt(index));
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

  function applySetup(setup: RoundSetup) {
    act((scoreManager) => scoreManager.applySetup(setup));
  }

  async function save() {
    await sendToApi((scoreManager) => scoreManager.save());
  }

  // 保存が失敗したら画面に残る(キャッシュも残るので、もう一度押せる)
  async function finish() {
    if (!manager || inFlight.current) return;
    setIsFinishing(true);
    const sent = await sendToApi(async (scoreManager) => {
      const gameId = await scoreManager.finish();
      beforeLeave();
      if (gameId === null) {
        router.replace("/");
        return;
      }
      // 試合のゲームは、ほかの人と比べられる試合の結果へ
      if (scoreManager.matchId !== null) {
        router.push(matchPath(scoreManager.matchId));
        return;
      }
      const params = new URLSearchParams();
      params.set("gameId", String(gameId));
      router.push(`/score-view?${params.toString()}`);
    });
    if (!sent) setIsFinishing(false);
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
    removePointAt,
    forwardPoint,
    backEnd,
    forwardEnd,
    applySetup,
    save,
    finish,
    movePoint,
    startPhotoReview,
    alignPhoto,
    photos,
    error,
    isSaving,
    isFinishing,
  };
}
