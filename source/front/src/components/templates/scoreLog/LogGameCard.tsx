import { GameRead } from "@/modules/data/score/scoreManager";
import { useRouter } from "next/navigation";
import { JSX } from "react";

interface Props {
  game: GameRead;
}

export default function LogGameCard(props: Props): JSX.Element {
  const router = useRouter();
  const startDate = props.game.recorded_at
    ? new Date(props.game.recorded_at)
    : null;
  const formattedStart =
    startDate && !Number.isNaN(startDate.getTime())
      ? new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(startDate)
      : "未設定";

  function onClickLogCard() {
    router.push(`/score-view/?gameId=${props.game.id}`);
  }

  return (
    <div
      className="ScoreLogGame flex flex-col gap-6 rounded-2xl border border-slate-200 shadow-sm m-3 p-3 bg-white/85 backdrop-blur-sm cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClickLogCard}
    >
      <div className="rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-500">
              Game ID
            </span>
            <span className="text-xl font-bold text-slate-900">
              {props.game.id}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <span className="text-sm font-semibold text-slate-500">
              開始日時
            </span>
            <span className="text-lg font-medium text-slate-800">
              {formattedStart}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-500">ユーザーID</div>
            <div className="mt-1 truncate text-base font-medium text-slate-800">
              {props.game.user_id ?? "未設定"}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-500">予定ラウンド数</div>
            <div className="mt-1 text-base font-medium text-slate-800">
              {props.game.game_size ?? "未設定"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
