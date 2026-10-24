import type { Texts } from "@/lib/text";

/** 点数の入力の画面。設定・スコアの画面から入り、ホームの「続ける」から戻る */
export const SCORE_CARD_PATH = "/game/score-card";

export interface Destination {
  href: string;
  /** T.nav のキー */
  label: keyof Texts["nav"];
  /** 管理者にだけ出す */
  adminOnly?: boolean;
}

/** ホームでは大きなボタンにし、ほかの行き先と分けて出す */
export const START_GAME: Destination = { href: "/game/setup", label: "startGame" };

/** 設定の画面へ、入れ方(的 / 点だけ)を渡す URL の引数。無ければ前回の入れ方 */
export const INPUT_MODE_PARAM = "input";
export const NUMBER_PAD_INPUT = "numbers";
export const TARGET_INPUT = "target";

/** メニュー(Nav)とホームのボタンに並べる行き先。この順に並べる */
export const DESTINATIONS: ReadonlyArray<Destination> = [
  START_GAME,
  { href: "/score-log", label: "scoreLog" },
  { href: "/analysis", label: "analysis" },
  { href: "/diary", label: "diary" },
  { href: "/profile/me", label: "profile" },
  { href: "/ranking", label: "ranking" },
  { href: "/announcements", label: "announcements" },
  { href: "/feedback", label: "feedback" },
  { href: "/settings", label: "settings" },
  { href: "/admin/feedbacks", label: "adminFeedback", adminOnly: true },
  { href: "/admin/error-reports", label: "adminErrorReports", adminOnly: true },
];

/** isAdmin でない人には adminOnly の行き先を除く */
export function destinationsFor(isAdmin: boolean): Array<Destination> {
  return DESTINATIONS.filter((destination) => isAdmin || !destination.adminOnly);
}
