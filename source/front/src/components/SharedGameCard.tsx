"use client";

import ArrowMap, { hasPosition } from "@/components/ArrowMap";
import RoundScoreSheet from "@/components/RoundScoreSheet";
import type { SharedGameRead } from "@/lib/api";
import { countRings, totalScore } from "@/lib/score/scoreFunctions";
import { useT } from "@/lib/text";

type Props = {
  game: SharedGameRead;
};

/**
 * 公開ページの一ゲーム。見出し(日付・持ち主・弓)、合計と X・10・M、的中の図、ゲームのコメント、
 * ラウンドごとの点数表(ラウンド・エンドのコメント)を、読むだけの形で出す。
 * 広い画面は、合計と的中の図を左の列に、点数表を右の列に並べる(globals.css の .shared-game-body)
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

  return (
    <article
      className="SharedGame shared-game"
      data-game-id={game.id}
    >
      <header className="shared-game-head">
        <h2>{T.profile.scoreShare.date(game.recorded_at)}</h2>
        <span className="muted small">
          {[game.owner_name, bowType].filter(Boolean).join(" / ")}
        </span>
      </header>
      <div className="shared-game-body">
        <div className="shared-game-side stack tight">
          <div className="GameSummary panel view-comment-block">
            <div className="view-summary">
              {items.map((item) => (
                <div key={item.label}>
                  <div className="muted small">{item.label}</div>
                  <div className="view-summary-value">{item.value}</div>
                </div>
              ))}
            </div>
            {game.comment && (
              <p className="GameComment CommentText view-comment-text">{game.comment}</p>
            )}
          </div>
          {points.some(hasPosition) && (
            <div className="ArrowMapPanel panel">
              <ArrowMap points={points} />
            </div>
          )}
        </div>
        <div className="shared-game-rounds stack tight">
          {game.rounds.length === 0 && (
            <p className="status empty">{T.profile.scoreView.noScores}</p>
          )}
          {game.rounds.map((round) => (
            <RoundScoreSheet
              key={round.id}
              round={round}
              roundComment={round.comment}
              endComment={(endId) => endComments.get(endId) ?? null}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
