"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EndView from "@/components/EndView";
import RoundTotalsBar from "@/components/RoundTotalsBar";
import CommentBar from "@/components/CommentBar";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import AimSettingsModal from "@/components/AimSettingsModal";
import GameSettingsModal from "@/components/GameSettingsModal";
import { useGuardScoreEntry } from "@/hooks/useGuardScoreEntry";
import { shortDate } from "@/lib/score/backfill";
import { isInnerTenBow } from "@/lib/score/scoreFunctions";
import { useScoreGame } from "@/lib/score/useScoreGame";
import {
  DEFAULT_AIM_SETTINGS,
  DEFAULT_END_SIZE,
  DEFAULT_TARGET_TYPE_ID,
  type AimSettings,
} from "@/lib/score/scoreConfig";
import { loadAimSettings } from "@/lib/storage";
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
  /** 手元の記録を API に保存して閉じる */
  finish: () => void;
  canBackPoint: boolean;
  canForwardPoint: boolean;
  canBackEnd: boolean;
  canForwardEnd: boolean;
  /** 1エンドが満ちたときの矢の数 */
  endSize: number;
  targetType: string;
  /** 矢の直径(mm)。入力の側が的の大きさとの比で px に直す */
  arrowDiameterMm: number;
  /** インサイドアウト: 矢の円が帯に完全に入らなければ、その帯の点にしない */
  allIn: boolean;
  /** インナー10: X の外の 10 点の帯を 9 点にする(コンパウンド) */
  innerTen: boolean;
  /** ズームの倍率・大きさと感度。記入画面の右上の設定から変えられる */
  aimSettings: AimSettings;
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
  const releaseGuard = useGuardScoreEntry();
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
    finish,
    applySetup,
    error,
    isSaving,
    isFinishing,
  } = useScoreGame(releaseGuard);
  const [aimSettings, setAimSettings] = useState(DEFAULT_AIM_SETTINGS);
  const [aimSettingsOpen, setAimSettingsOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);

  // サーバーでの描画中は localStorage を読めないので、画面に載ってから当てる
  useEffect(() => {
    setAimSettings(loadAimSettings());
  }, []);

  const endSize = progress?.endSize ?? DEFAULT_END_SIZE;

  // globals.css の main:has(> .score-entry) が main の余白を消すので、この div を main の直下に置く
  return (
    <div className="score-entry">
      <div className="score-top">
        <button
          type="button"
          className="ghost icon"
          onClick={() => {
            releaseGuard();
            router.push("/");
          }}
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
            {manager?.backfillDate && (
              <span className="BackfillBadge progress-badge">
                {T.game.entry.backfill(shortDate(manager.backfillDate, T.intlLocale))}
              </span>
            )}
          </div>
        )}
        {/* ✕ と向かい合う右上に置く。進み具合が短くても右端に寄せる */}
        <div className="score-settings">
          <button
            type="button"
            className="GameSettingsOpen ghost icon"
            onClick={() => setGameSettingsOpen(true)}
            disabled={!manager || isSaving}
            aria-label={T.game.entry.gameSettings}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                cx="12"
                cy="12"
                r="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                cx="12"
                cy="12"
                r="1.5"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            className="AimSettingsOpen ghost icon"
            onClick={() => setAimSettingsOpen(true)}
            aria-label={T.game.entry.aimSettings}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              aria-hidden="true"
            >
              <path
                d="M4 7h10M18 7h2M4 17h2M10 17h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle
                cx="16"
                cy="7"
                r="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                cx="8"
                cy="17"
                r="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
      </div>
      {aimSettingsOpen && (
        <AimSettingsModal
          settings={aimSettings}
          onClose={() => setAimSettingsOpen(false)}
          onSave={(settings) => {
            setAimSettings(settings);
            setAimSettingsOpen(false);
          }}
        />
      )}
      {gameSettingsOpen && manager && (
        <GameSettingsModal
          setup={manager.gameSetup}
          minSizes={manager.setupMinSizes}
          onClose={() => setGameSettingsOpen(false)}
          onSave={(setup) => {
            applySetup(setup);
            setGameSettingsOpen(false);
          }}
        />
      )}
      {!manager ? (
        <div className="score-loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {progress && (
            <RoundTotalsBar
              roundTotal={progress.roundTotal}
              endTotals={progress.endTotals}
              endNumber={progress.endNumber}
            />
          )}
          {error && (
            <ApiErrorAlert
              error={error}
              className="floating"
            />
          )}
          {/* エンドが満ちたときは文を出さず、「1エンド進む」の強調だけで知らせる(ScoreEntryActions) */}
          {progress?.isGameComplete && (
            <p className="GameCompleteNotice notice done">{T.game.entry.gameComplete}</p>
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
              finish,
              canBackPoint: progress?.canBackPoint ?? false,
              canForwardPoint: progress?.canForwardPoint ?? false,
              canBackEnd: progress?.canBackEnd ?? false,
              canForwardEnd: progress?.canForwardEnd ?? false,
              endSize,
              targetType: progress ? manager.targetType : DEFAULT_TARGET_TYPE_ID,
              arrowDiameterMm: manager.arrowDiameterMm,
              allIn: manager.allIn,
              innerTen: isInnerTenBow(manager.bowType),
              aimSettings,
              isEndFull: progress?.isEndFull ?? false,
              isGameComplete: progress?.isGameComplete ?? false,
              disabled: isSaving,
            })}
          </div>
        </>
      )}
      {/* ✕ や設定も押せないよう、画面ごと覆う */}
      {isFinishing && (
        <div
          className="FinishingOverlay busy-overlay"
          role="status"
          aria-live="polite"
        >
          <div className="busy-card">
            <div className="spinner" />
            <span>{T.game.entry.finishing}</span>
          </div>
        </div>
      )}
    </div>
  );
}
