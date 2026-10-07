"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import { useLoad } from "@/hooks/useLoad";
import PageHeader from "@/components/PageHeader";
import MonthRangeFilter from "@/components/MonthRangeFilter";
import StatSummaryCard from "@/components/StatSummaryCard";
import RoundScoreChart from "@/components/RoundScoreChart";
import {
  RangePreset,
  presetRange,
  toIsoMonthBound,
} from "@/lib/monthRange";
import { useT } from "@/lib/text";
import {
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
  const T = useT();
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<StatisticsQuery>({});
  const [preset, setPreset] = useState<RangePreset | "custom">("all");
  const { data, loading, error } = useLoad<DashboardData>(async () => {
    const [roundStats, endStats, pointStats, rounds] = await Promise.all([
      getRoundScoreStatistics(appliedQuery),
      getEndScoreStatistics(appliedQuery),
      getPointScoreStatistics(appliedQuery),
      listRoundScores(appliedQuery),
    ]);
    return { roundStats, endStats, pointStats, rounds };
  }, [appliedQuery]);

  function handlePreset(next: RangePreset) {
    setPreset(next);
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery(presetRange(next));
  }

  function handleCustom() {
    setPreset("custom");
  }

  function handleApply() {
    setAppliedQuery({
      start: toIsoMonthBound(startMonth, "start"),
      end: toIsoMonthBound(endMonth, "end"),
    });
  }

  function handleReset() {
    setPreset("all");
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery({});
  }

  return (
    <div className="page wide">
      <PageHeader title={T.stats.analysis.title} />
      <div
        className="toolbar"
        role="group"
        aria-label={T.stats.analysis.presetLabel}
      >
        {(["year", "month", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={preset === key ? "primary" : undefined}
            aria-pressed={preset === key}
            onClick={() => handlePreset(key)}
          >
            {T.stats.analysis.preset[key]}
          </button>
        ))}
        <button
          type="button"
          className={preset === "custom" ? "primary" : undefined}
          aria-pressed={preset === "custom"}
          onClick={handleCustom}
        >
          {T.stats.analysis.preset.custom}
        </button>
      </div>
      {preset === "custom" && (
        <MonthRangeFilter
          startMonth={startMonth}
          endMonth={endMonth}
          onStartMonthChange={setStartMonth}
          onEndMonthChange={setEndMonth}
          onApply={handleApply}
          onReset={handleReset}
        />
      )}

      {loading && <p className="status empty">{T.loading}</p>}

      {error && <ApiErrorAlert error={error} />}

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
