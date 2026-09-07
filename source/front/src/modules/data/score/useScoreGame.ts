"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreManager } from "@/modules/data/score/scoreManager";
import { toErrorDetails, type ErrorDetails, type PointRead } from "@/lib/api";
import {
  DEFAULT_ROUND_SIZE,
  type RoundSetup,
} from "@/modules/data/score/scoreConfig";
import {
  clearGameId,
  loadGameId,
  loadRoundSetup,
} from "@/modules/functions/localStorage";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { useRunOnce } from "@/hooks/useRunOnce";

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
 * size/end count/round count from the setup screen (see
 * localStorage.loadRoundSetup); a resumed game already has those values on
 * its rounds and ignores it.
 */
export function useScoreGame() {
  const router = useRouter();
  const [manager, setManager] = useState<ScoreManager | null>(null);
  const [mirrorPoints, setMirrorPoints] = useState<Array<PointRead>>([]);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  async function setupGame() {
    setError(null);
    setIsSettingUp(true);
    try {
      const { id: userId } = await getCurrentAppUser();
      const scoreManager = await setupOrResumeGame(userId, loadRoundSetup());
      setManager(scoreManager);
      setMirrorPoints([...scoreManager.currentPoints]);
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
  async function next(point: number, x: number = 0, y: number = 0) {
    if (!manager || !manager.game || isSaving) return;

    setIsSaving(true);
    try {
      const roundSize = manager.currentRound?.round_size ?? DEFAULT_ROUND_SIZE;
      if (manager.ends.length >= roundSize) {
        await manager.addRound();
        setMirrorPoints([]);
      } else {
        await manager.addPoint(point, x, y);
        setMirrorPoints([...manager.currentPoints]);
      }
      setManager(manager);
      setError(null);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setIsSaving(false);
    }
  }

  async function back() {
    if (!manager || isSaving) return;

    setIsSaving(true);
    try {
      if (manager.currentPoints.length > 0) {
        const p = await manager.removePoint();
        if (p) {
          setMirrorPoints([...p]);
        }
      } else if (manager.ends.length > 0) {
        await manager.removeEnd();
        setMirrorPoints([...manager.currentPoints]);
      } else if (manager.rounds.length > 0) {
        await manager.removeRound();
        setMirrorPoints([...manager.currentPoints]);
      }
      setError(null);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setIsSaving(false);
    }
  }

  // No API call of its own, but must not send the user to /score-view while a
  // previous next()/addEnd() write is still in flight or has failed, since
  // that would show a score view missing the entry the user thinks they made.
  function finish() {
    if (!manager?.gameId || isSaving || error) return;

    clearGameId();
    const params = new URLSearchParams();
    params.set("gameId", manager.gameId);
    router.push(`/score-view/?${params.toString()}`);
  }

  async function addEnd() {
    if (!manager || !manager.game || isSaving) return;

    setIsSaving(true);
    try {
      await manager.addEnd();
      setMirrorPoints([]);
      setError(null);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setIsSaving(false);
    }
  }

  return {
    manager,
    mirrorPoints,
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
