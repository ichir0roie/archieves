/** stats の画面(ホームの今月のまとめ・統計ダッシュボード・ランキング)の文言。 */
export const stats = {
  monthSummary: "今月のまとめ",
  noMonthRecords: "今月の記録はまだありません",
  roundLabel: (date: string, number: number) => `${date} ラウンド${number}`,
  average: (value: string) => `平均${value}点`,
  averageUnit: (unit: string) => `平均${unit}`,
  card: {
    round: "ラウンド合計点",
    end: "エンド合計点",
    point: "矢1本あたり",
  },
  metric: {
    min: "最小",
    max: "最大",
    median: "中央値",
    count: "件数",
  },
  chart: {
    empty: "表示できるラウンドがありません",
    ariaLabel: "ラウンドごとの合計点の推移を示す線グラフ",
    pointTitle: (number: number, date: string, total: number, average: string) =>
      `ラウンド${number}（${date}）\n合計: ${total}点 / 平均: ${average}点`,
  },
  filter: {
    startMonth: "開始月",
    endMonth: "終了月",
    monthPlaceholder: "YYYY/MM",
  },
  analysis: {
    title: "統計ダッシュボード",
    loadFailed: "統計情報の取得に失敗しました",
  },
  ranking: {
    title: "ランキング",
    organization: "所属",
    region: "地域ID",
    empty: "該当するデータがありません",
  },
} as const;
