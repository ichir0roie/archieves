"use client";

import { useLoad } from "@/hooks/useLoad";
import StatSummaryCard from "@/components/StatSummaryCard";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import MonthScoreList from "@/components/MonthScoreList";
import { currentMonthRange } from "@/lib/monthRange";
import { useT } from "@/lib/text";
import {
  RoundScoreSummary,
  ScoreStatistics,
  getEndScoreStatistics,
  getPointScoreStatistics,
  getRoundScoreStatistics,
  listRoundScores,
} from "@/lib/api";

type MonthData = {
  roundStats: ScoreStatistics;
  endStats: ScoreStatistics;
  pointStats: ScoreStatistics;
  rounds: RoundScoreSummary[];
};

export default function MonthDashboard() {
  const T = useT();
  const { data, loading, error } = useLoad<MonthData>(async () => {
    const { start, end } = currentMonthRange();
    const [roundStats, endStats, pointStats, rounds] = await Promise.all([
      getRoundScoreStatistics({ start, end }),
      getEndScoreStatistics({ start, end }),
      getPointScoreStatistics({ start, end }),
      listRoundScores({ start, end }),
    ]);
    return { roundStats, endStats, pointStats, rounds };
  }, []);

  return (
    <section className="stack tight">
      <span className="section-label">{T.stats.monthSummary}</span>

      {error && <ApiErrorAlert error={error} />}

      {loading && <p className="status empty">{T.loading}</p>}

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

          <MonthScoreList rounds={data.rounds} />
        </>
      )}
    </section>
  );
}
