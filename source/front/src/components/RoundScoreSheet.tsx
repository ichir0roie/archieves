"use client";

import { Fragment, type ReactNode } from "react";
import CommentField from "@/components/CommentField";
import type { RoundSheetRead } from "@/lib/api";
import { DEFAULT_END_SIZE } from "@/lib/score/scoreConfig";
import { scoreToStr, totalScore } from "@/lib/score/scoreFunctions";
import { useT } from "@/lib/text";

type Props = {
  round: RoundSheetRead;
  /** 見出しのラウンドの番号。取り込んだ記録は round.number が 0 から始まることがあるので、並び順から 1 で数えて渡す */
  number: number;
  roundComment: string | null;
  endComment: (endId: number) => string | null;
  /** 渡せばコメントを書くアイコンを出す(本人の score-view)。公開ページは渡さず、読むだけにする */
  onSaveRoundComment?: (roundId: number, body: string) => Promise<void>;
  onSaveEndComment?: (endId: number, body: string) => Promise<void>;
  /** 表の右に並べるもの(公開ページのラウンドの的中の図) */
  aside?: ReactNode;
  /** 見出しの下に並べる項目と値(公開ページの距離・的の大きさ・弓の種類) */
  details?: Array<{ label: string; value: string }>;
};

/** ラウンドの点数表(エンドごとの矢・小計・累計)と、ラウンド・エンドのコメント。 */
export default function RoundScoreSheet(props: Props) {
  const T = useT();
  const { round } = props;
  const { onSaveRoundComment, onSaveEndComment } = props;
  // 取り込んだラウンドはアプリの既定と違う矢数のことがあるので、列は定数でなくラウンドに合わせる
  const endSize = round.end_size ?? DEFAULT_END_SIZE;
  // 矢・小計・累計の列に、編集できるときはコメントのアイコンの列を足す
  const columnCount = endSize + 3 + (onSaveEndComment ? 1 : 0);

  let roundTotal = 0;
  const rows = round.ends.map((end) => {
    const endTotal = totalScore(end.points);
    roundTotal += endTotal;
    return { end, endTotal, runningTotal: roundTotal };
  });

  return (
    <section
      className={`RoundScoreSheet panel stack tight${props.aside ? " has-aside" : ""}`}
    >
      <div className="view-comment view-round-head">
        <div>
          <div className="view-round-title">
            {T.profile.scoreView.round(props.number)}
          </div>
          <div className="muted small">
            {T.profile.scoreView.date(round.recorded_at)}
          </div>
          {props.details && props.details.length > 0 && (
            <dl className="RoundDetails view-round-details small">
              {props.details.map((detail) => (
                <div key={detail.label}>
                  <dt className="muted">{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {onSaveRoundComment && (
          <CommentField
            iconOnly
            title={T.profile.scoreView.roundTitle(props.number)}
            body={props.roundComment}
            onSave={(body) => onSaveRoundComment(round.id, body)}
          />
        )}
      </div>
      {props.roundComment && (
        <p className="RoundComment CommentText view-comment-text">
          {props.roundComment}
        </p>
      )}

      <div className="view-sheet-scroll">
        <table className="list view-sheet">
          <thead>
            <tr>
              <th className="end-col" />
              {Array.from({ length: endSize }, (_, index) => index + 1).map(
                (arrowNumber) => (
                  <th key={arrowNumber}>{arrowNumber}</th>
                ),
              )}
              {/* 合計の列は幅を決めておき、コメントの列に押されて潰れないようにする */}
              <th className="sum-col">{T.profile.scoreView.subtotal}</th>
              <th className="sum-col">{T.profile.scoreView.total}</th>
              {onSaveEndComment && <th className="icon-col" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const comment = props.endComment(row.end.id);
              return (
                <Fragment key={row.end.id}>
                  <tr>
                    <td className="end-col">{row.end.number}</td>
                    {Array.from({ length: endSize }, (_, index) => (
                      <td key={`arrow-${index}`}>
                        {row.end.points[index]
                          ? scoreToStr(row.end.points[index].score)
                          : T.none}
                      </td>
                    ))}
                    <td>{row.endTotal}</td>
                    <td>{row.runningTotal}</td>
                    {onSaveEndComment && (
                      <td className="icon-col">
                        <CommentField
                          iconOnly
                          title={T.profile.scoreView.endTitle(row.end.number)}
                          body={comment}
                          onSave={(body) => onSaveEndComment(row.end.id, body)}
                        />
                      </td>
                    )}
                  </tr>
                  {comment && (
                    <tr className="comment-row">
                      <td colSpan={columnCount}>
                        <span className="CommentText">{comment}</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.aside && <div className="view-sheet-aside">{props.aside}</div>}
    </section>
  );
}
