import type { stats as ja } from "../ja/stats";
import { terms as t } from "./terms";

export const stats: typeof ja = {
  monthSummary: "This month's summary",
  noMonthRecords: "No games this month yet",
  roundLabel: (date: string, number: number) => `${date} ${t.roundN(number)}`,
  average: (value: string) => `Avg ${value}${t.unit.point}`,
  averageUnit: (unit: string) => `Avg ${unit}`,
  card: {
    round: "Total points per round",
    end: "Total points per end",
    point: "Points per arrow",
  },
  metric: {
    min: "Min",
    max: "Max",
    median: "Median",
    count: "Count",
  },
  chart: {
    empty: "No rounds to show",
    ariaLabel: (axis: string) => `Line chart of daily ${axis}`,
    pointTitle: (date: string, value: string, count: number) =>
      `${date}\n${value}${t.unit.point} (average of ${count})`,
  },
  filter: {
    startMonth: "Start month",
    endMonth: "End month",
    monthPlaceholder: "YYYY/MM",
  },
  analysis: {
    title: "Statistics dashboard",
    presetLabel: "Period presets",
    preset: {
      year: "Past year",
      month: "Past month",
      all: t.allPeriod,
      custom: "Custom",
    },
    axis: "Chart axis",
    axisOption: {
      round: "Average per round",
      end: "Average per end",
      point: "Average per arrow",
    },
    kind: {
      bowType: t.bowType,
      distance: t.distance,
      targetType: t.targetType,
      endSize: "Arrows per end",
      roundSize: "Ends per round",
      gameSize: "Rounds per game",
    },
  },
  ranking: {
    title: t.ranking,
    organization: t.affiliation,
    region: "Region ID",
    empty: "No data found",
    period: "Period",
    periodOption: {
      month: "Monthly",
      year: "Yearly",
      total: t.allPeriod,
    },
    metric: "Rank by",
    metricOption: {
      total_score: t.totalPoints,
      average_round_score: "Average per round",
      average_point_score: "Average per arrow",
    },
    bowType: t.bowType,
    distance: t.distance,
    unit: {
      total_score: t.unit.point,
      average_round_score: " pts/round",
      average_point_score: " pts/arrow",
    },
    rounds: (count: number) => `${count} ${count === 1 ? "round" : "rounds"}`,
  },
};
