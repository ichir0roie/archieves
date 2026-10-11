import { terms as t } from "./terms";

/** stats の画面(統計ダッシュボード・ランキング)の文言。 */
export const stats = {
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
    ariaLabel: (axis: string) => `日ごとの${axis}の推移を示す線グラフ`,
    pointTitle: (date: string, value: string, count: number) =>
      `${date}\n${value}${t.unit.point}(${count}件の${t.average})`,
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
    axis: "グラフの軸",
    axisOption: {
      round: `${t.round}${t.average}`,
      end: `${t.end}${t.average}`,
      point: `${t.arrow}1本の${t.average}`,
    },
    kind: {
      bowType: t.bowType,
      distance: t.distance,
      targetType: t.targetType,
      endSize: `1${t.end}の${t.arrow}数`,
      roundSize: `${t.end}数`,
      gameSize: `${t.round}数`,
    },
  },
  ranking: {
    title: t.ranking,
    organization: t.affiliation,
    region: "地域ID",
    empty: "該当するデータがありません",
    visibilityNote: `${t.ranking}を公開している人(全体公開か、同じ${t.affiliation}へのグループ公開)だけが載ります。`,
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
