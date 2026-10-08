import { terms as t } from "./terms";

/** stats の画面(ホームの今月のまとめ・統計ダッシュボード・ランキング)の文言。 */
export const stats = {
  monthSummary: "今月のまとめ",
  noMonthRecords: `今月の${t.game}はまだありません`,
  roundLabel: (date: string, number: number) => `${date} ${t.roundN(number)}`,
  average: (value: string) => `${t.average}${value}${t.unit.point}`,
  averageUnit: (unit: string) => `${t.average}${unit}`,
  card: {
    round: `${t.round}${t.totalPoints}`,
    end: `${t.end}${t.totalPoints}`,
    point: `${t.arrow}1本あたり`,
  },
  metric: {
    min: "最小",
    max: "最大",
    median: "中央値",
    count: "件数",
  },
  chart: {
    empty: `表示できる${t.round}がありません`,
    ariaLabel: `${t.round}ごとの${t.totalPoints}の推移を示す線グラフ`,
    pointTitle: (number: number, date: string, total: number, average: string) =>
      `${t.roundN(number)}(${date})\n${t.total}: ${total}${t.unit.point} / ${t.average}: ${average}${t.unit.point}`,
  },
  filter: {
    startMonth: "開始月",
    endMonth: "終了月",
    monthPlaceholder: "YYYY/MM",
  },
  analysis: {
    title: `${t.statistics}ダッシュボード`,
    presetLabel: "期間のプリセット",
    preset: {
      year: "直近1年",
      month: "直近1か月",
      all: t.allPeriod,
      custom: "その他",
    },
  },
  ranking: {
    title: t.ranking,
    organization: t.affiliation,
    region: "地域ID",
    empty: "該当するデータがありません",
    period: "期間",
    periodOption: {
      month: "月間",
      year: "年間",
      total: t.allPeriod,
    },
    metric: "順位の基準",
    metricOption: {
      total_score: t.totalPoints,
      average_round_score: `${t.round}${t.average}`,
      average_point_score: `${t.arrow}${t.average}`,
    },
    bowType: t.bowType,
    distance: t.distance,
    unit: {
      total_score: t.unit.point,
      average_round_score: `${t.unit.point}/${t.round}`,
      average_point_score: `${t.unit.point}/${t.unit.arrow}`,
    },
    rounds: (count: number) => `${count} ${t.round}`,
  },
};
