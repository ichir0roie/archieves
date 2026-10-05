"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, CircularProgress } from "@mui/material";
import EndView from "@/components/EndView";
import CommentBar from "@/components/CommentBar";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import AuthGate from "@/components/AuthGate";
import { useScoreGame } from "@/lib/score/useScoreGame";
import {
  DEFAULT_END_SIZE,
  DEFAULT_TARGET_TYPE_ID,
} from "@/lib/score/scoreConfig";
import type { PointRead } from "@/lib/api";
import type { SheetRound } from "@/lib/score/scoreManager";

export interface ScoreInputProps {
  points: Array<PointRead>;
  /**
   * The end/round/game comment rows. Each mode places them itself so they
   * always read directly under the scores it draws.
   */
  commentBar: ReactNode;
  /** Every round/end of the game so far, for modes that show the whole sheet. */
  sheet: Array<SheetRound>;
  next: (point: number, x?: number, y?: number) => void;
  nextEnd: () => void;
  back: () => void;
  finish: () => void;
  /** Arrows this end holds when full. */
  endSize: number;
  targetType: string;
  /** Every arrow of this end is in: only 次へ / 終了 are left to press. */
  isEndFull: boolean;
  /** Every arrow of the whole game is in: there is no next end to move to. */
  isGameComplete: boolean;
  disabled: boolean;
}

interface Props {
  renderInput: (props: ScoreInputProps) => ReactNode;
  /**
   * Off for modes that draw the whole game's score sheet themselves, so the
   * single-end strip above the input isn't a second copy of the same end.
   */
  showEndView?: boolean;
}

/**
 * Shared page shell for the touch-target and simple score entry modes
 * (/game/score-card, /game/simple-score-card): the round/end/arrow progress
 * bar, the loading/error/retry states around useScoreGame, and EndView.
 * Only the score input widget itself differs between modes.
 */
export default function ScoreEntryShell({ renderInput, showEndView = true }: Props) {
  const router = useRouter();
  const {
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
    retry,
  } = useScoreGame();

  const endSize = progress?.endSize ?? DEFAULT_END_SIZE;

  return (
    <AuthGate>
      {() => (
        <div className="bg-white h-dvh flex flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
            <button
              onClick={() => router.push("/")}
              aria-label="ホームへ戻る"
              className="text-lg leading-none text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
            {progress && (
              <div className="ScoreProgress flex flex-1 items-center justify-center gap-4 text-base">
                <span>
                  ラウンド{" "}
                  <span className="text-2xl font-bold leading-none">
                    {progress.roundNumber}
                  </span>
                  /{progress.gameSize}
                </span>
                <span>
                  END{" "}
                  <span className="text-2xl font-bold leading-none">
                    {progress.endNumber}
                  </span>
                  /{progress.roundSize}
                </span>
                <span className={progress.isEndFull ? "text-emerald-600" : undefined}>
                  <span className="text-2xl font-bold leading-none">
                    {progress.arrowCount}
                  </span>
                  /{progress.endSize}本
                </span>
              </div>
            )}
          </div>
          {!manager ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
              {error ? (
                <>
                  <ApiErrorAlert error={error} className="w-full max-w-xl" />
                  <Button
                    variant="contained"
                    disabled={isSettingUp}
                    onClick={() => retry()}
                  >
                    再試行
                  </Button>
                </>
              ) : (
                <CircularProgress />
              )}
            </div>
          ) : (
            <>
              {error && (
                <ApiErrorAlert
                  error={error}
                  className="fixed top-16 left-3 right-3 z-10 max-h-[60vh] overflow-auto"
                />
              )}
              {progress?.isGameComplete ? (
                <p className="GameCompleteNotice shrink-0 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-700">
                  全ラウンドの記録が終わりました。「終了」でスコアを確認できます。
                </p>
              ) : (
                progress?.isEndFull && (
                  <p className="EndCompleteNotice shrink-0 bg-sky-50 px-4 py-2 text-center text-sm font-semibold text-sky-700">
                    このエンドは記録済みです。「次へ」で次のエンドに進みます。
                  </p>
                )
              )}
              {showEndView && <EndView points={mirrorPoints} endSize={endSize} />}
              <div className="min-h-0 flex-1">
                {renderInput({
                  points: mirrorPoints,
                  sheet,
                  commentBar: (
                    <CommentBar
                      comments={comments}
                      roundNumber={progress?.roundNumber ?? 0}
                      endNumber={progress?.endNumber ?? 0}
                      onSave={saveComment}
                      disabled={isSaving}
                    />
                  ),
                  next,
                  nextEnd: addEnd,
                  back,
                  finish,
                  endSize,
                  targetType: progress ? manager.targetType : DEFAULT_TARGET_TYPE_ID,
                  isEndFull: progress?.isEndFull ?? false,
                  isGameComplete: progress?.isGameComplete ?? false,
                  disabled: isSaving,
                })}
              </div>
            </>
          )}
        </div>
      )}
    </AuthGate>
  );
}
