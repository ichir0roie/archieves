"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import EndView from "@/components/EndView";
import CommentBar from "@/components/CommentBar";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import { useGuardScoreEntry } from "@/hooks/useGuardScoreEntry";
import { useScoreGame } from "@/lib/score/useScoreGame";
import {
  DEFAULT_END_SIZE,
  DEFAULT_TARGET_TYPE_ID,
} from "@/lib/score/scoreConfig";
import type { SheetPoint } from "@/lib/score/scoreSheetCache";
import { useT } from "@/lib/text";

export type ScoreInputProps = {
  points: Array<SheetPoint>;
  /** エンド・ラウンド・ゲームのコメントの行。点数のすぐ下に来るよう、置く場所は入力の側が決める */
  commentBar: ReactNode;
  next: (point: number, x?: number, y?: number) => void;
  /** 今のエンドの最後の矢を消す / 消した矢を入れ直す */
  backPoint: () => void;
  forwardPoint: () => void;
  /** 今のエンドを消して前のエンドに戻る / 消したエンドを入れ直す(無ければ次のエンドを開く) */
  backEnd: () => void;
  forwardEnd: () => void;
  /** 手元の記録を API に保存する / 保存して閉じる */
  save: () => void;
  finish: () => void;
  /** 保存していない変更がある */
  hasUnsavedChanges: boolean;
  canBackPoint: boolean;
  canForwardPoint: boolean;
  canBackEnd: boolean;
  canForwardEnd: boolean;
  /** 1エンドが満ちたときの矢の数 */
  endSize: number;
  targetType: string;
  /** このエンドの矢がすべて入った。残る操作は 次へ / 終了 だけ */
  isEndFull: boolean;
  /** ゲームの矢がすべて入った。次のエンドは無い */
  isGameComplete: boolean;
  disabled: boolean;
};

type Props = {
  renderInput: (props: ScoreInputProps) => ReactNode;
};

/**
 * 点数の入力(/game/score-card)の枠。
 * 進み具合の帯、保存のエラー、EndView を受け持ち、入力の部品だけを入れ替える。
 */
export default function ScoreEntryShell({ renderInput }: Props) {
  const T = useT();
  const router = useRouter();
  useGuardScoreEntry();
  const {
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
    save,
    finish,
    hasUnsavedChanges,
    error,
    isSaving,
  } = useScoreGame();

  const endSize = progress?.endSize ?? DEFAULT_END_SIZE;

  // globals.css の main:has(> .score-entry) が main の余白を消すので、この div を main の直下に置く
  return (
    <div className="score-entry">
      <div className="score-top">
        <button
          type="button"
          className="ghost icon"
          onClick={() => router.push("/")}
          aria-label={T.game.entry.home}
        >
          ✕
        </button>
        {progress && (
          <div className="ScoreProgress score-progress">
            <span>
              {T.game.entry.round}{" "}
              <b>{progress.roundNumber}</b>/{progress.gameSize}
            </span>
            <span>
              {T.game.entry.end}{" "}
              <b>{progress.endNumber}</b>/{progress.roundSize}
            </span>
            <span className={progress.isEndFull ? "full" : undefined}>
              <b>{progress.arrowCount}</b>/{progress.endSize}
              {T.unit.arrow}
            </span>
          </div>
        )}
      </div>
      {!manager ? (
        <div className="score-loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {error && (
            <ApiErrorAlert
              error={error}
              className="floating"
            />
          )}
          {progress?.isGameComplete ? (
            <p className="GameCompleteNotice notice done">{T.game.entry.gameComplete}</p>
          ) : (
            progress?.isEndFull && (
              <p className="EndCompleteNotice notice full">
                {progress.isRoundFull ? T.game.entry.roundComplete : T.game.entry.endComplete}
              </p>
            )
          )}
          <EndView
            points={mirrorPoints}
            endSize={endSize}
          />
          <div className="grow">
            {renderInput({
              points: mirrorPoints,
              commentBar: (
                <CommentBar
                  comments={comments}
                  roundNumber={progress?.roundNumber ?? 0}
                  endNumber={progress?.endNumber ?? 0}
                  isRoundFull={progress?.isRoundFull ?? false}
                  onSave={saveComment}
                  disabled={isSaving}
                />
              ),
              next,
              backPoint,
              forwardPoint,
              backEnd,
              forwardEnd,
              save,
              finish,
              hasUnsavedChanges,
              canBackPoint: progress?.canBackPoint ?? false,
              canForwardPoint: progress?.canForwardPoint ?? false,
              canBackEnd: progress?.canBackEnd ?? false,
              canForwardEnd: progress?.canForwardEnd ?? false,
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
  );
}
