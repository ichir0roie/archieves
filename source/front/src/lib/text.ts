/**
 * 画面に出す文言をすべてここに置く。コンポーネントに文言を直に書かない。
 * 利用者は日本語で使うので、文言は日本語で書く。数などを差し込むものは関数にする。
 * db の値(利用者の名前・団体名など)はここに置かない。
 */
export const T = {
  appName: "Archieves",
  appDescription: "あなたのスコアを記録・管理するアプリケーション",
  appTitle: "スコア管理アプリ",
  api: {
    signInRequired: "ログインしてください",
    unreachable: (reason: string) => `API に届かない: ${reason}`,
    failed: "通信に失敗しました。もう一度お試しください。",
  },
} as const;
