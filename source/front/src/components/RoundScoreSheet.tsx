"use client";

import { Fragment, useState, type ReactNode } from "react";
import ArrowMap, { hasPosition } from "@/components/ArrowMap";
import CommentField from "@/components/CommentField";
import Modal from "@/components/Modal";
import type { RoundSheetRead } from "@/lib/api";
import { DEFAULT_END_SIZE } from "@/lib/score/scoreConfig";
import { ringClass, scoreToStr, totalScore } from "@/lib/score/scoreFunctions";
import { useT } from "@/lib/text";

type Props = {
  round: RoundSheetRead;
  roundComment: string | null;
  endComment: (endId: number) => string | null;
  /** 渡せばコメントを書くアイコンを出す(本人の score-view)。公開ページは渡さず、読むだけにする */
  onSaveRoundComment?: (roundId: number, body: string) => Promise<void>;
  onSaveEndComment?: (endId: number, body: string) => Promise<void>;
  /** 表の右に並べるもの(公開ページのラウンドの的中の図) */
  aside?: ReactNode;
};

/**
 * ラウンドの点数表(エンドごとの矢・小計・累計)と、ラウンド・エンドのコメント。
 * エンドの行を押すと、そのエンドの矢だけを的に描いたモーダルを開く。
 */
export default function RoundScoreSheet(props: Props) {
  const T = useT();
  const { round } = props;
  const { onSaveRoundComment, onSaveEndComment } = props;
  // 取り込んだラウンドはアプリの既定と違う矢数のことがあるので、列は定数でなくラウンドに合わせる
  const endSize = round.end_size ?? DEFAULT_END_SIZE;
  // 矢・小計・累計の列に、編集できるときはコメントのアイコンの列を足す
  const columnCount = endSize + 3 + (onSaveEndComment ? 1 : 0);
  const [openEndId, setOpenEndId] = useState<number | null>(null);

  let roundTotal = 0;
  const rows = round.ends.map((end) => {
    const endTotal = totalScore(end.points);
    roundTotal += endTotal;
    return { end, endTotal, runningTotal: roundTotal };
  });
  const openRow = rows.find((row) => row.end.id === openEndId) ?? null;

  return (
    <section
      className={`RoundScoreSheet panel stack tight${props.aside ? " has-aside" : ""}`}
    >
      <div className="view-comment view-round-head">
        <div>
          <div className="view-round-title">
            {T.profile.scoreView.round(round.number)}
          </div>
          <div className="muted small">
            {T.profile.scoreView.date(round.recorded_at)}
          </div>
        </div>
        {onSaveRoundComment && (
          <CommentField
            iconOnly
            title={T.profile.scoreView.roundTitle(round.number)}
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
                  <tr
                    className="EndRow end-row"
                    onClick={() => setOpenEndId(row.end.id)}
                  >
                    <td className="end-col">
                      {/* 行のどこを押しても開く。ボタンはキーボード・読み上げで開くためのもの */}
                      <button
                        type="button"
                        className="EndMapButton end-map-button"
                        aria-label={T.profile.scoreView.openEndMap(row.end.number)}
                      >
                        {row.end.number}
                      </button>
                    </td>
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
                      // コメントのアイコンを押したときは、行の的のモーダルを開かない
                      <td
                        className="icon-col"
                        onClick={(event) => event.stopPropagation()}
                      >
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
      {openRow && (
        <Modal
          title={T.profile.scoreView.endMapTitle(round.number, openRow.end.number)}
          onClose={() => setOpenEndId(null)}
        >
          <EndMap
            points={openRow.end.points}
            endTotal={openRow.endTotal}
          />
        </Modal>
      )}
    </section>
  );
}

/** 一エンドの矢の点数と合計、その矢だけを描いた的。位置の無い矢(数字だけの入力)は的に描かない */
function EndMap({
  points,
  endTotal,
}: {
  points: RoundSheetRead["ends"][number]["points"];
  endTotal: number;
}) {
  const T = useT();
  return (
    <div className="EndMap stack tight">
      <div className="end-map-scores">
        {points.map((point, index) => (
          <span
            key={index}
            className={`arrow-chip ${ringClass(point.score)}`}
          >
            {scoreToStr(point.score)}
          </span>
        ))}
        <span className="end-map-total">
          {T.profile.scoreView.subtotal} <b>{endTotal}</b>
        </span>
      </div>
      {points.some(hasPosition) ? (
        <ArrowMap
          points={points}
          label={T.profile.scoreView.endMapLabel}
        />
      ) : (
        <p className="status info">{T.profile.scoreView.endMapNoPosition}</p>
      )}
    </div>
  );
}
