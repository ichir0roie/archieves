"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, CircularProgress } from "@mui/material";
import EndView from "@/components/templates/score/EndView";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import AuthGate from "@/components/auth/AuthGate";
import { useScoreGame } from "@/modules/data/score/useScoreGame";
import {
  DEFAULT_ROUND_SIZE,
  DEFAULT_END_SIZE,
  DEFAULT_TARGET_TYPE_ID,
} from "@/modules/data/score/scoreConfig";
import type { PointRead } from "@/lib/api";

export interface ScoreInputProps {
  points: Array<PointRead>;
  next: (point: number, x?: number, y?: number) => void;
  nextEnd: () => void;
  back: () => void;
  finish: () => void;
  pointSize: number;
  targetType: string;
  disabled: boolean;
}

interface Props {
  renderInput: (props: ScoreInputProps) => ReactNode;
}

/**
 * Shared page shell for the touch-target and simple score entry modes
 * (/game/score-card, /game/simple-score-card): the END counter header, the
 * loading/error/retry states around useScoreGame, and EndView. Only the
 * score input widget itself differs between modes.
 */
export default function ScoreEntryShell({ renderInput }: Props) {
  const router = useRouter();
  const {
    manager,
    mirrorPoints,
    next,
    back,
    finish,
    addEnd,
    error,
    isSaving,
    isSettingUp,
    retry,
  } = useScoreGame();

  return (
    <AuthGate>
      {() => (
        <div className="bg-white h-dvh flex flex-col">
          <div className="fixed top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm">
            <button
              onClick={() => router.push("/")}
              aria-label="ホームへ戻る"
              className="text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
            <span>
              END {manager?.ends.length ?? 0}/
              {manager?.currentRound?.round_size ?? DEFAULT_ROUND_SIZE}
            </span>
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
              <EndView points={mirrorPoints} />
              <div className="min-h-0 flex-1">
                {renderInput({
                  points: mirrorPoints,
                  next,
                  nextEnd: addEnd,
                  back,
                  finish,
                  pointSize: manager?.currentRound?.end_size ?? DEFAULT_END_SIZE,
                  targetType: manager?.currentRound?.target_type ?? DEFAULT_TARGET_TYPE_ID,
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
