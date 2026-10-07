/**
 * 用語集(日本語)。画面に出す語はここで一つに決め、各画面の文言はここから組み立てる。
 * 同じものを指す語を画面ごとに書き分けない(「記録」「スコア」「ポイント」などの表記ゆれを防ぐ)。
 * en/terms.ts と同じキーで持つ。
 *
 * 使い分け:
 * - ゲーム: 1回の記録のまとまり(ラウンドの集まり)。一覧・詳細ではこの語で呼ぶ
 * - 記録: 「ゲーム開始」のように、スコアを付ける動作
 * - 矢: 射った1本。数えるときは「本」
 * - 点: 得点の単位。合計は「合計点」
 * - 大会: 大会情報として登録するもの(ゲームとは別)
 */
export const terms = {
  game: "ゲーム",
  round: "ラウンド",
  end: "エンド",
  arrow: "矢",
  score: "スコア",
  scoreLog: "スコア",
  record: "記録",
  total: "合計",
  totalPoints: "合計点",
  average: "平均",
  comment: "コメント",
  match: "大会",
  organization: "組織",
  affiliation: "所属",
  profile: "プロフィール",
  settings: "設定",
  home: "ホーム",
  ranking: "ランキング",
  statistics: "統計",
  import: "インポート",
  distance: "距離",
  bowType: "弓の種類",
  targetType: "的の種類",
  link: "リンク",
  allPeriod: "全期間",
  roundN: (n: number) => `ラウンド ${n}`,
  endN: (n: number) => `エンド ${n}`,
  unit: {
    point: "点",
    arrow: "本",
  },
};
