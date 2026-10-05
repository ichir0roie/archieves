"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import MonthRangeFilter from "@/components/MonthRangeFilter";
import StatSummaryCard from "@/components/StatSummaryCard";
import RoundScoreChart from "@/components/RoundScoreChart";
import { toIsoMonthBound } from "@/lib/monthRange";
import { T } from "@/lib/text";
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

type DashboardData = {
  roundStats: ScoreStatistics;
  endStats: ScoreStatistics;
  pointStats: ScoreStatistics;
  rounds: RoundScoreSummary[];
};

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
          setError(e instanceof ApiError ? e.message : T.stats.analysis.loadFailed);
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
    <div className="page wide">
      <PageHeader title={T.stats.analysis.title} />
      <MonthRangeFilter
        startMonth={startMonth}
        endMonth={endMonth}
        onStartMonthChange={setStartMonth}
        onEndMonthChange={setEndMonth}
        onApply={handleApply}
        onReset={handleReset}
      />

      {loading && <p className="status empty">{T.loading}</p>}

      {!loading && error && (
        <p
          role="alert"
          className="status error"
        >
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          <div className="cards">
            <StatSummaryCard
              title={T.stats.card.round}
              unit={T.unit.point}
              stats={data.roundStats}
            />
            <StatSummaryCard
              title={T.stats.card.end}
              unit={T.unit.point}
              stats={data.endStats}
            />
            <StatSummaryCard
              title={T.stats.card.point}
              unit={T.unit.point}
              stats={data.pointStats}
            />
          </div>

          <RoundScoreChart rounds={data.rounds} />
        </>
      )}
    </div>
  );
}
