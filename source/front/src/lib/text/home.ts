/** ホーム(app/page.tsx)。 */
export const home = {
  welcome: (name: string) => `ようこそ、${name} さん`,
  tagline: "スコアを記録・管理しよう",
  startScore: "スコア記録を開始",
  registerMatch: "大会情報の登録",
  profileSettings: "プロフィール設定",
} as const;
