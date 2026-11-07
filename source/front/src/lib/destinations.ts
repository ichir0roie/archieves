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

/** 試合: ID で参加する・自分の試合の一覧。結果は MATCH_RESULT_PATH(?id=<試合の id>) */
export const MATCH_PATH = "/match";
export const MATCH_RESULT_PATH = "/match/result";

/** ホームでは大きなボタンにし、ほかの行き先と分けて出す */
export const START_GAME: Destination = { href: "/game/setup", label: "startGame" };

/** メニュー(Nav)とホームのボタンに並べる行き先。この順に並べる */
export const DESTINATIONS: ReadonlyArray<Destination> = [
  START_GAME,
  { href: MATCH_PATH, label: "match" },
  { href: "/score-log", label: "scoreLog" },
  { href: "/analysis", label: "analysis" },
  { href: "/diary", label: "diary" },
  { href: "/profile/me", label: "profile" },
  { href: "/ranking", label: "ranking" },
  { href: "/announcements", label: "announcements" },
  { href: "/guide", label: "guide" },
  { href: "/feedback", label: "feedback" },
  { href: "/settings", label: "settings" },
  { href: "/admin/feedbacks", label: "adminFeedback", adminOnly: true },
  { href: "/admin/error-reports", label: "adminErrorReports", adminOnly: true },
  { href: "/admin/organizations", label: "adminOrganizations", adminOnly: true },
];

/** ログインしていない人のメニューに並べる行き先(lib/auth/openPaths.ts の、ログインなしで開ける画面) */
export const SIGNED_OUT_DESTINATIONS: ReadonlyArray<Destination> = DESTINATIONS.filter((destination) =>
  ["/ranking", "/guide"].includes(destination.href),
);

/** isAdmin でない人には adminOnly の行き先を除く */
export function destinationsFor(isAdmin: boolean): Array<Destination> {
  return DESTINATIONS.filter((destination) => isAdmin || !destination.adminOnly);
}
