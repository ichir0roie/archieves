import Link from "next/link";
import { RoundScoreSummary } from "@/lib/api";

interface Props {
  rounds: RoundScoreSummary[];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export default function MonthScoreList({ rounds }: Props) {
  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-400 shadow-sm">
        今月の記録はまだありません
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
      {rounds.map((round) => (
        <Link
          key={round.round_id}
          href={`/score-view/?gameId=${round.game_id}`}
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"
        >
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-800">
              {formatDate(round.recorded_at)} ラウンド{round.number}
            </span>
            <span className="text-xs text-slate-400">
              {round.arrow_count}本
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-lg font-bold text-slate-900">
              {round.total_score}点
            </span>
            <span className="text-xs text-slate-400">
              平均
              {round.average_score !== null
                ? round.average_score.toFixed(1)
                : "-"}
              点
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
