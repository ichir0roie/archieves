/**
 * ログインしていなくても開ける画面(ホーム・使い方・ランキング・プロフィール)。
 * ログインしていればいつもの画面になり、していなければ公開の分だけを出す(AuthGate の useSignedIn)。
 * スコアの公開ページ(lib/scoreShare.ts の isPublicPath)は別で、ログインの門もメニューも外す
 */
export function isOpenPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/guide" ||
    pathname === "/ranking" ||
    /^\/profile\/\d+$/.test(pathname)
  );
}

/** ログインしていない人のサインインのボタンの行き先。ログインの門を通ったあと、ホームへ戻す */
export const SIGN_IN_PATH = "/signin";

/**
 * モックのログイン(NEXT_PUBLIC_AUTH_MODE=mock)で、ログインしていない人を真似るクッキー。
 * これがあると、画面も route handler もログインしていない扱いにする(E2E でログインなしの画面を確かめるため)
 */
export const MOCK_SIGNED_OUT_COOKIE = "archieves-mock-signed-out";

/** document.cookie(ブラウザ)に、モックのログインなしのクッキーがあるか */
export function hasMockSignedOutCookie(cookie: string): boolean {
  return cookie.split(";").some((part) => part.trim().startsWith(`${MOCK_SIGNED_OUT_COOKIE}=`));
}
