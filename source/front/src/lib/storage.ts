import {
  DEFAULT_ROUND_SETUP,
  isValidRoundSetup,
  type RoundSetup,
} from "@/lib/score/scoreConfig";

const ROUND_SETUP_KEY = "roundSetup";

/** The distance/target size/arrows per end/end count/round count chosen on the setup screen. */
export function saveRoundSetup(setup: RoundSetup) {
  localStorage.setItem(ROUND_SETUP_KEY, JSON.stringify(setup));
}

/**
 * Anything stored under this key is user-editable and can predate a change
 * to RoundSetup's shape, so a stored setup that no longer describes a
 * scorable game is treated as absent rather than fed to ScoreManager.
 */
export function loadRoundSetup(): RoundSetup | null {
  const raw = localStorage.getItem(ROUND_SETUP_KEY);
  if (!raw) return null;
  try {
    const setup = { ...DEFAULT_ROUND_SETUP, ...(JSON.parse(raw) as Partial<RoundSetup>) };
    return isValidRoundSetup(setup) ? setup : null;
  } catch {
    return null;
  }
}

const SCORE_LOG_COLLAPSED_KEY = "scoreLogCollapsed";

/** スコアで閉じている見出しのキー(年・月・日)。localStorage が使えなければ全部開いた扱い */
export function loadScoreLogCollapsed(): Array<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SCORE_LOG_COLLAPSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function saveScoreLogCollapsed(keys: Array<string>) {
  try {
    localStorage.setItem(SCORE_LOG_COLLAPSED_KEY, JSON.stringify(keys));
  } catch {
    // 保存できなくても、開閉そのものは画面の中で動く
  }
}

const APP_USER_KEY = "appUser";
const APP_USER_EVENT = "archieves:app-user";

/** API の利用者(`/users/me`)のうち、画面を開くたびに読み直さずに済ませたいもの */
export interface CachedAppUser {
  sub: string;
  id: number;
  name: string;
  isAdmin: boolean;
}

/** 別の人がログインし直したときに前の人の値を使わないよう、今のログインの sub と合うときだけ返す */
export function loadCachedAppUser(sub: string): CachedAppUser | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(APP_USER_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return null;
    const user = parsed as Partial<CachedAppUser>;
    if (
      user.sub !== sub ||
      typeof user.id !== "number" ||
      typeof user.name !== "string" ||
      typeof user.isAdmin !== "boolean"
    ) {
      return null;
    }
    return {
      sub: user.sub,
      id: user.id,
      name: user.name,
      isAdmin: user.isAdmin,
    };
  } catch {
    return null;
  }
}

/** 書いたら、開いたままのメニュー(Nav)などが読み直せるよう知らせる */
export function saveCachedAppUser(user: CachedAppUser) {
  try {
    localStorage.setItem(APP_USER_KEY, JSON.stringify(user));
  } catch {
    // 保存できなければ、次に要るときに API から読む
  }
  window.dispatchEvent(new Event(APP_USER_EVENT));
}

export function clearCachedAppUser() {
  try {
    localStorage.removeItem(APP_USER_KEY);
  } catch {
    // 消せなくても、sub が違えば使われない
  }
  window.dispatchEvent(new Event(APP_USER_EVENT));
}

export function subscribeCachedAppUser(onChange: () => void): () => void {
  window.addEventListener(APP_USER_EVENT, onChange);
  // 別のタブでの書き換え
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(APP_USER_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const TARGET_DIAMETER_KEY = "targetDiameterPx";

/** 記入画面で最後に描いた的の直径(px)。設定画面が矢の太さ(mm)を px に直して見本を描くのに使う */
export function saveTargetDiameterPx(diameterPx: number) {
  if (diameterPx <= 0) return;
  try {
    localStorage.setItem(TARGET_DIAMETER_KEY, String(diameterPx));
  } catch {
    // 保存できなければ、設定画面は画面の幅から見積もる
  }
}

export function loadTargetDiameterPx(): number | null {
  try {
    const value = Number(localStorage.getItem(TARGET_DIAMETER_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
