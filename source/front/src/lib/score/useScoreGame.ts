"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScoreManager,
  type ScoreProgress,
  type SheetRound,
} from "@/lib/score/scoreManager";
import { toErrorDetails, type ErrorDetails, type PointRead } from "@/lib/api";
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
import { useRunOnce } from "@/lib/useRunOnce";

/** The notes shown on the entry screen: the game's, and the round/end in progress. */
export interface ScoreComments {
  game: string | null;
  round: string | null;
  end: string | null;
}

let setupInFlight: Promise<ScoreManager> | null = null;

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
 * Game/round/end/point lifecycle shared by every score entry mode page
 * (touch-target, simple). A new game picks up its distance/target
 * size/arrows per end/end count/round count from the setup screen (see
 * localStorage.loadRoundSetup); a resumed game already has those values on
 * its rounds and ignores it.
 */
export function useScoreGame() {
  const router = useRouter();
  const [manager, setManager] = useState<ScoreManager | null>(null);
  const [mirrorPoints, setMirrorPoints] = useState<Array<PointRead>>([]);
  const [progress, setProgress] = useState<ScoreProgress | null>(null);
  const [sheet, setSheet] = useState<Array<SheetRound>>([]);
  const [comments, setComments] = useState<ScoreComments>({
    game: null,
    round: null,
    end: null,
  });
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Every mutator hands the screen a fresh copy of what the manager now
  // holds. The manager itself is mutable and keeps its identity, so nothing
  // else would tell React the score sheet moved on.
  function syncFrom(scoreManager: ScoreManager) {
    setMirrorPoints([...scoreManager.currentPoints]);
    setProgress(scoreManager.progress);
    setSheet(scoreManager.sheet);
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
      setManager(scoreManager);
      syncFrom(scoreManager);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setIsSettingUp(false);
    }
  }

  const { runOnMount, run: retrySetupGame } = useRunOnce(setupGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  // API calls made via `manager` are not awaited by the caller directly (the
  // button onClick just invokes this async function), so any failure must be
  // caught here rather than left to become an unhandled rejection. On
  // failure, `mirrorPoints`/`manager` are left untouched so the screen does
  // not advance past a point/round/end that was never actually saved.
  async function run(action: (scoreManager: ScoreManager) => Promise<void>): Promise<boolean> {
    if (!manager || isSaving) return false;

    setIsSaving(true);
    try {
      await action(manager);
      syncFrom(manager);
      setError(null);
      return true;
    } catch (e) {
      setError(toErrorDetails(e));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function next(point: number, x: number = 0, y: number = 0) {
    await run(async (scoreManager) => {
      if (!scoreManager.currentRound || scoreManager.isEndFull) return;
      await scoreManager.addPoint(point, x, y);
    });
  }

  async function back() {
    await run(async (scoreManager) => {
      if (scoreManager.currentPoints.length > 0) {
        await scoreManager.removePoint();
      } else if (scoreManager.ends.length > 0) {
        await scoreManager.removeEnd();
      }
    });
  }

  async function addEnd() {
    await run(async (scoreManager) => {
      if (!scoreManager.currentRound || scoreManager.isGameComplete) return;
      await scoreManager.addEnd();
    });
  }

  // Unlike scoring an arrow, this is driven from a modal that has to know
  // whether the write went through: a failure has to leave the text the
  // player typed on screen rather than close over it.
  async function saveComment(target: CommentTarget, body: string) {
    const saved = await run(async (scoreManager) => {
      await scoreManager.saveComment(target, body);
    });
    if (!saved) throw new Error("コメントを保存できませんでした。");
  }

  // Must not send the user to /score-view while a previous next()/addEnd()
  // write is still in flight or has failed, since that would show a score
  // view missing the entry the user thinks they made.
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
    sheet,
    comments,
    saveComment,
    next,
    back,
    finish,
    addEnd,
    error,
    isSaving,
    isSettingUp,
    retry: retrySetupGame,
  };
}
