"use client";

import ArrowMap, { hasPosition } from "@/components/ArrowMap";
import RoundScoreSheet from "@/components/RoundScoreSheet";
import type { RoundSheetRead, SharedGameRead } from "@/lib/api";
import { currentTargetTypeId } from "@/lib/score/scoreConfig";
import { countRings, totalScore } from "@/lib/score/scoreFunctions";
import { useT } from "@/lib/text";

type Props = {
  game: SharedGameRead;
};

/** 的の大きさ。取り込んだ記録の的は "unknown" で大きさが分からないので出さない */
function targetSize(round: RoundSheetRead): string | null {
  const id = currentTargetTypeId(round.target_type);
  return /^\d+cm$/.test(id) ? id : null;
}

/** 距離と的はラウンドごとに持つので、ゲームの欄にはラウンドで違う値を順に並べる */
function distinctValues(values: Array<string | null>): string | null {
  const distinct = [...new Set(values.filter((value) => value !== null))];
  return distinct.length > 0 ? distinct.join("・") : null;
}

/**
 * 公開ページの一ゲーム。見出し(日付・持ち主)、合計と X・10・M・距離・的の大きさ・弓の種類・ゲームのコメントを
 * 一行まるまる使って出し、その下にラウンドごとの点数表(ラウンド・エンドのコメント)と、
 * そのラウンドの的中の図を同じ行に並べる
 */
export default function SharedGameCard({ game }: Props) {
  const T = useT();
  const points = game.rounds.flatMap((round) => round.ends.flatMap((end) => end.points));
  const { x, ten, miss } = countRings(points);
  const items = [
    { label: T.profile.scoreView.gameTotal, value: totalScore(points) },
    { label: T.profile.scoreView.countX, value: x },
    { label: T.profile.scoreView.countTen, value: ten },
    { label: T.profile.scoreView.countMiss, value: miss },
  ];
  const endComments = new Map(
    game.rounds.flatMap((round) => round.ends.map((end) => [end.id, end.comment] as const)),
  );
  const bowType = game.bow_type ? (T.options.bowType[game.bow_type] ?? game.bow_type) : null;
  const distance = distinctValues(game.rounds.map((round) => `${round.distance_m}m`));
  const size = distinctValues(game.rounds.map(targetSize));
  const details = [
    { label: T.profile.scoreShare.distance, value: distance },
    { label: T.profile.scoreShare.targetSize, value: size },
    { label: T.profile.scoreShare.bowType, value: bowType },
  ].filter((detail) => detail.value !== null);

  return (
    <article
      className="SharedGame shared-game"
      data-game-id={game.id}
    >
      <header className="shared-game-head">
        <h2>{T.profile.scoreShare.date(game.recorded_at)}</h2>
        <span className="muted small">{game.owner_name}</span>
      </header>
      <div className="GameSummary panel view-comment-block">
        <div className="view-summary">
          {items.map((item) => (
            <div key={item.label}>
              <div className="muted small">{item.label}</div>
              <div className="view-summary-value">{item.value}</div>
            </div>
          ))}
        </div>
        {details.length > 0 && (
          <dl className="GameDetails shared-game-details small">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt className="muted">{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {game.comment && (
          <p className="GameComment CommentText view-comment-text">{game.comment}</p>
        )}
      </div>
      {game.rounds.length === 0 && <p className="status empty">{T.profile.scoreView.noScores}</p>}
      {game.rounds.map((round) => {
        const roundPoints = round.ends.flatMap((end) => end.points);
        return (
          <RoundScoreSheet
            key={round.id}
            round={round}
            roundComment={round.comment}
            endComment={(endId) => endComments.get(endId) ?? null}
            aside={roundPoints.some(hasPosition) && <ArrowMap points={roundPoints} />}
          />
        );
      })}
    </article>
  );
}
