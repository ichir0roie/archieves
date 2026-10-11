"use client";

import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { useT } from "@/lib/text";

type StepIconProps = {
  direction: "back" | "forward";
  /** 2 つ重ねた三角(エンド)。1 つなら矢 */
  double: boolean;
};

/** ◀ / ▶(矢)と ◀◀ / ▶▶(エンド)。文字の ▶ は端末によって絵文字で出るので SVG で描く */
function StepIcon({ direction, double }: StepIconProps) {
  const triangles =
    direction === "forward"
      ? double
        ? ["M2 4l9 8-9 8z", "M12 4l9 8-9 8z"]
        : ["M7 4l10 8-10 8z"]
      : double
        ? ["M22 4l-9 8 9 8z", "M12 4l-9 8 9 8z"]
        : ["M17 4l-10 8 10 8z"];
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
    >
      {triangles.map((d) => (
        <path
          key={d}
          d={d}
          fill="currentColor"
          strokeLinejoin="round"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

/** 終了のゴールの旗 */
function FinishIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path
        d="M5 21V3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 4h13l-3 4.5 3 4.5H5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 終了 / 1矢戻る・進む / 1エンド戻る・進む を一行に並べる。途中の保存のボタンは置かない。
 * 記録は手元のキャッシュに残り、終了で API に送る。
 * 戻る・進むは形と短い添え字だけを見せ、読み上げの名前(aria-label)に元の文言を残す
 */
export default function ScoreEntryActions(props: ScoreInputProps) {
  const T = useT();
  return (
    <div className="ScoreEntryActions score-actions">
      <button
        type="button"
        className={props.isGameComplete ? "step finish success" : "step finish"}
        onClick={props.finish}
        disabled={props.disabled}
      >
        <FinishIcon />
        <span className="caption">{T.game.entry.finish}</span>
      </button>
      <button
        type="button"
        className="step"
        onClick={props.backPoint}
        disabled={props.disabled || !props.canBackPoint}
        aria-label={T.game.entry.backPoint}
      >
        <StepIcon
          direction="back"
          double={false}
        />
        <span className="caption">{T.game.entry.pointCaption}</span>
      </button>
      <button
        type="button"
        className="step"
        onClick={props.forwardPoint}
        disabled={props.disabled || !props.canForwardPoint}
        aria-label={T.game.entry.forwardPoint}
      >
        <StepIcon
          direction="forward"
          double={false}
        />
        <span className="caption">{T.game.entry.pointCaption}</span>
      </button>
      <button
        type="button"
        className="step"
        onClick={props.backEnd}
        disabled={props.disabled || !props.canBackEnd}
        aria-label={T.game.entry.backEnd}
      >
        <StepIcon
          direction="back"
          double
        />
        <span className="caption">{T.game.entry.endCaption}</span>
      </button>
      <button
        type="button"
        className={props.isEndFull && !props.isGameComplete ? "step primary" : "step"}
        onClick={props.forwardEnd}
        disabled={props.disabled || !props.canForwardEnd}
        aria-label={T.game.entry.forwardEnd}
      >
        <StepIcon
          direction="forward"
          double
        />
        <span className="caption">{T.game.entry.endCaption}</span>
      </button>
    </div>
  );
}
