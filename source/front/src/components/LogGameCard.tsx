import { useRouter } from "next/navigation";
import { GameRead } from "@/lib/score/scoreManager";
import { useT } from "@/lib/text";

type Props = {
  game: GameRead;
};

/** スコアログの一行。押すとそのゲームの点数表(score-view)へ移る。 */
export default function LogGameCard({ game }: Props) {
  const T = useT();
  const router = useRouter();
  const startDate = game.recorded_at ? new Date(game.recorded_at) : null;
  const formattedStart =
    startDate && !Number.isNaN(startDate.getTime())
      ? new Intl.DateTimeFormat(T.intlLocale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(startDate)
      : T.notSet;

  return (
    <button
      type="button"
      className="ScoreLogGame"
      onClick={() => router.push(`/score-view/?gameId=${game.id}`)}
    >
      <div className="main">
        <span className="section-label">{T.profile.scoreLog.gameId}</span>
        <span className="big">{game.id}</span>
      </div>
      <div className="side">
        <span className="section-label">{T.profile.scoreLog.startedAt}</span>
        <span>{formattedStart}</span>
        <span className="muted small">
          {T.profile.scoreLog.userId} {game.user_id ?? T.notSet}
        </span>
        <span className="muted small">
          {T.profile.scoreLog.gameSize} {game.game_size ?? T.notSet}
        </span>
      </div>
    </button>
  );
}
