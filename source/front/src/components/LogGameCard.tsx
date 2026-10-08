import { useRouter } from "next/navigation";
import { GameRead } from "@/lib/score/scoreManager";
import { useT } from "@/lib/text";

type Props = {
  game: GameRead;
};

/** スコアの一行。押すとそのゲームの点数表(score-view)へ移る。 */
export default function LogGameCard({ game }: Props) {
  const T = useT();
  const router = useRouter();

  return (
    <button
      type="button"
      className="ScoreLogGame"
      onClick={() => router.push(`/score-view/?gameId=${game.id}`)}
    >
      <span className="log-game-id">
        <span className="muted small">{T.profile.scoreLog.gameId}</span>{" "}
        {game.id}
      </span>
      <span className="muted small">
        {T.profile.scoreLog.gameSize} {game.game_size ?? T.notSet}
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
