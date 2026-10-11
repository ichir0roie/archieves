import { useRouter } from "next/navigation";
import { GameScoreSummary } from "@/lib/api";
import { GameRead } from "@/lib/api";
import { useT } from "@/lib/text";

type Props = {
  game: GameRead;
  day: string;
  summary: GameScoreSummary | undefined;
};

/** スコアの一行(日・合計点・エンド平均・ポイント平均)。押すとそのゲームの点数表(score-view)へ移る。 */
export default function LogGameCard({ game, day, summary }: Props) {
  const T = useT();
  const router = useRouter();
  const average = (value: number | null | undefined) =>
    value === null || value === undefined ? T.none : value.toFixed(1);

  return (
    <button
      type="button"
      className="ScoreLogGame"
      data-game-id={game.id}
      onClick={() => router.push(`/score-view/?gameId=${game.id}`)}
    >
      <span className="log-cell log-day">{T.profile.scoreLog.day(day)}</span>
      <span className="log-cell">
        <span className="muted small">{T.profile.scoreLog.total}</span>
        <b>{summary?.total_score ?? T.none}</b>
      </span>
      <span className="log-cell">
        <span className="muted small">{T.profile.scoreLog.endAverage}</span>
        <b>{average(summary?.end_average)}</b>
      </span>
      <span className="log-cell">
        <span className="muted small">{T.profile.scoreLog.pointAverage}</span>
        <b>{average(summary?.point_average)}</b>
      </span>
      <span
        className="log-game-go"
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  );
}
