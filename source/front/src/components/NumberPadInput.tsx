"use client";

import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass, scoreToStr } from "@/lib/score/scoreFunctions";
import { MISS_SCORE, X_SCORE } from "@/lib/score/scoreConfig";

/**
 * 利き手の親指の付け根(画面の下の角)を中心にした弧ごとの点数。内側の弧ほど付け根に近い。
 * よく撃つ高い点を、親指を伸ばさずに届く内側に置く
 */
const ARCS: ReadonlyArray<{ radius: number; scores: ReadonlyArray<number> }> = [
  {
    radius: 0.3,
    scores: [X_SCORE, 10, 9],
  },
  {
    radius: 0.56,
    scores: [8, 7, 6, 5],
  },
  {
    radius: 0.82,
    scores: [4, 3, 2, 1, MISS_SCORE],
  },
];

/** 弧の上で使う角度(度)。0 が横、90 が真上。端のボタンが画面の縁で切れないよう少し内に寄せる */
const MIN_ANGLE = 8;
const MAX_ANGLE = 82;

/**
 * 的を押さず、数字のボタンで点数だけを入れる。あとから入力するとき向けで、矢の位置は null で残す。
 * ボタンは利き手の側の下の角から扇形に並べ、左利きなら左右を反転する
 */
export default function NumberPadInput(props: ScoreInputProps) {
  const isLocked = props.disabled || props.isEndFull;
  const rightHanded = props.aimSettings.handedness === "right";

  return (
    <div className="NumberPadInput target-input">
      {props.commentBar}
      <div className="number-pad-area">
        <div className="number-pad">
          {ARCS.flatMap(({ radius, scores }) =>
            scores.map((score, index) => {
              // 先頭(高い点)を真上の側に置き、横へ向かって下げていく
              const angle =
                MAX_ANGLE - ((MAX_ANGLE - MIN_ANGLE) * index) / Math.max(scores.length - 1, 1);
              const rad = (angle * Math.PI) / 180;
              const fromCorner = radius * Math.cos(rad) * 100;
              const fromBottom = radius * Math.sin(rad) * 100;
              return (
                <button
                  key={score}
                  type="button"
                  className={`NumberPadKey number-pad-key ${ringClass(score)}`}
                  style={{
                    left: `${rightHanded ? 100 - fromCorner : fromCorner}%`,
                    top: `${100 - fromBottom}%`,
                  }}
                  disabled={isLocked}
                  onClick={() => props.next(score, null, null)}
                >
                  {scoreToStr(score)}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}
