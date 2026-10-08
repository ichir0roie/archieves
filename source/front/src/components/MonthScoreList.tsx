import Link from "next/link";
import { RoundScoreSummary } from "@/lib/api";
import { useT, type Texts } from "@/lib/text";

type Props = {
  rounds: RoundScoreSummary[];
};

function formatDate(T: Texts, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return T.none;
  return new Intl.DateTimeFormat(T.intlLocale, {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export default function MonthScoreList({ rounds }: Props) {
  const T = useT();
  if (rounds.length === 0) {
    return <p className="status empty">{T.stats.noMonthRecords}</p>;
  }

  return (
    <div className="row-list">
      {rounds.map((round) => (
        <Link
          key={round.round_id}
          href={`/score-view/?gameId=${round.game_id}`}
        >
          <div className="main">
            <span>{T.stats.roundLabel(formatDate(T, round.recorded_at), round.number)}</span>
            <span className="muted small">
              {round.arrow_count}
              {T.unit.arrow}
            </span>
          </div>
          <div className="side">
            <span className="big">
              {round.total_score}
              {T.unit.point}
            </span>
            <span className="muted small">
              {T.stats.average(round.average_score !== null ? round.average_score.toFixed(1) : T.none)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
