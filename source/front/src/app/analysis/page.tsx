"use client";

import AuthGate from "@/components/auth/AuthGate";
import { useEffect, useState } from "react";
import Header from "@/components/templates/common/header";
import MonthRangeFilter from "@/components/templates/common/MonthRangeFilter";
import StatSummaryCard from "@/components/templates/analysis/StatSummaryCard";
import RoundScoreChart from "@/components/templates/analysis/RoundScoreChart";
import { toIsoMonthBound } from "@/lib/date/monthRange";
import {
  ApiError,
  ScoreStatistics,
  RoundScoreSummary,
  StatisticsQuery,
  getEndScoreStatistics,
  getPointScoreStatistics,
  getRoundScoreStatistics,
  listRoundScores,
} from "@/lib/api";

interface DashboardData {
  roundStats: ScoreStatistics;
  endStats: ScoreStatistics;
  pointStats: ScoreStatistics;
  rounds: RoundScoreSummary[];
}

export default function Page() {
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<StatisticsQuery>({});
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [roundStats, endStats, pointStats, rounds] = await Promise.all([
          getRoundScoreStatistics(appliedQuery),
          getEndScoreStatistics(appliedQuery),
          getPointScoreStatistics(appliedQuery),
          listRoundScores(appliedQuery),
        ]);
        if (!cancelled) {
          setData({ roundStats, endStats, pointStats, rounds });
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "統計情報の取得に失敗しました",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  function handleApply() {
    setAppliedQuery({
      start: toIsoMonthBound(startMonth, "start"),
      end: toIsoMonthBound(endMonth, "end"),
    });
  }

  function handleReset() {
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery({});
  }

  return (
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="統計ダッシュボード" />
        <div className="flex w-full flex-col gap-3 p-3">
          <MonthRangeFilter
            startMonth={startMonth}
            endMonth={endMonth}
            onStartMonthChange={setStartMonth}
            onEndMonthChange={setEndMonth}
            onApply={handleApply}
            onReset={handleReset}
          />

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 shadow-sm">
              {error}
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

              <RoundScoreChart rounds={data.rounds} />
            </>
          )}
        </div>
      </main>
    </AuthGate>
  );
}
