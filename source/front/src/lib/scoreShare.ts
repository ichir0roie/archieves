/** スコアの公開ページ。ログインしていなくても開ける(AuthGate を通さない) */
export const SCORE_SHARE_PATH = "/score-share";

/** 公開ページに出すゲームの id を並べるクエリ。`?ids=12,13,14` */
export const SCORE_SHARE_IDS_PARAM = "ids";

// API の app/api/v1/endpoints/public.py の MAX_SHARED_GAMES と同じ
export const MAX_SHARED_GAMES = 200;

/** ログインしていなくても見せる画面か。AuthGate・メニューなど、ログインを前提にするものを外す */
export function isPublicPath(pathname: string): boolean {
  return pathname === SCORE_SHARE_PATH || pathname.startsWith(`${SCORE_SHARE_PATH}/`);
}

/** gameIds を載せた公開ページの URL。origin はブラウザの location.origin */
export function scoreShareUrl(origin: string, gameIds: ReadonlyArray<number>): string {
  return `${origin}${SCORE_SHARE_PATH}?${SCORE_SHARE_IDS_PARAM}=${gameIds.join(",")}`;
}

/** クエリの `ids` を id の並びに。数でないもの・重なりは捨て、多すぎる分は切る */
export function parseShareIds(value: string | null): Array<number> {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_SHARED_GAMES);
}
