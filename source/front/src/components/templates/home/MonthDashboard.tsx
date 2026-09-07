"use client";

import { useEffect, useState } from "react";
import StatSummaryCard from "@/components/templates/analysis/StatSummaryCard";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import MonthScoreList from "./MonthScoreList";
import { currentMonthRange } from "@/lib/date/monthRange";
import {
  RoundScoreSummary,
  ScoreStatistics,
  getEndScoreStatistics,
  getPointScoreStatistics,
  getRoundScoreStatistics,
  listRoundScores,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";

interface MonthData {
  roundStats: ScoreStatistics;
  endStats: ScoreStatistics;
  pointStats: ScoreStatistics;
  rounds: RoundScoreSummary[];
}

export default function MonthDashboard() {
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { start, end } = currentMonthRange();
        const [roundStats, endStats, pointStats, rounds] = await Promise.all([
          getRoundScoreStatistics({ start, end }),
          getEndScoreStatistics({ start, end }),
          getPointScoreStatistics({ start, end }),
          listRoundScores({ start, end }),
        ]);
        if (!cancelled) {
          setData({ roundStats, endStats, pointStats, rounds });
        }
      } catch (e) {
        if (!cancelled) setError(toErrorDetails(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-3">
      <span className="text-sm font-semibold text-slate-500">
        今月のまとめ
      </span>

      {error && <ApiErrorAlert error={error} />}

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
          読み込み中...
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatSummaryCard
              title="ラウンド合計点"
              unit="点"
              stats={data.roundStats}
            />
            <StatSummaryCard
              title="エンド合計点"
              unit="点"
              stats={data.endStats}
            />
            <StatSummaryCard
              title="矢1本あたり"
              unit="点"
              stats={data.pointStats}
            />
          </div>

          <MonthScoreList rounds={data.rounds} />
        </>
      )}
    </div>
  );
}
