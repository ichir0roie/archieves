import type { terms as ja } from "../ja/terms";

/**
 * 用語集(英語)。ja/terms.ts と同じキーで持ち、画面の文言はここから組み立てる。
 * 使い分けは ja/terms.ts の説明に合わせる(Game = 記録のまとまり、Record = 記録する動作、Arrow = 矢、点 = point)。
 */
export const terms: typeof ja = {
  game: "Game",
  round: "Round",
  end: "End",
  arrow: "Arrow",
  score: "Score",
  scoreLog: "Score",
  record: "Record",
  total: "Total",
  totalPoints: "Total points",
  average: "Average",
  comment: "Comment",
  match: "Competition",
  organization: "Organization",
  affiliation: "Affiliation",
  profile: "Profile",
  settings: "Settings",
  home: "Home",
  ranking: "Ranking",
  statistics: "Statistics",
  import: "Import",
  export: "Export",
  distance: "Distance",
  bowType: "Bow type",
  targetType: "Target face",
  link: "Link",
  allPeriod: "All time",
  roundN: (n: number) => `Round ${n}`,
  endN: (n: number) => `End ${n}`,
  unit: {
    point: " pts",
    arrow: " arrows",
  },
};
