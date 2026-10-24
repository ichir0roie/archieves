import {
  currentTargetTypeId,
  DEFAULT_AIM_SETTINGS,
  DEFAULT_ROUND_SETUP,
  isValidAimSettings,
  isValidRoundSetup,
  selectableTargetTypeId,
  type AimSettings,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import {
  SCORE_SHEET_CACHE_VERSION,
  type ScoreSheetCache,
  type Sheet,
} from "@/lib/score/scoreSheetCache";

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
    // 的のプリセットを変えた。前に選んだ的が選べなくなっても、ほかの設定は残す
    setup.targetType = selectableTargetTypeId(String(setup.targetType));
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

const DIARY_LOG_COLLAPSED_KEY = "diaryLogCollapsed";

/** 日記一覧で閉じている月のキー。localStorage が使えなければ全部開いた扱い */
export function loadDiaryLogCollapsed(): Array<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DIARY_LOG_COLLAPSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function saveDiaryLogCollapsed(keys: Array<string>) {
  try {
    localStorage.setItem(DIARY_LOG_COLLAPSED_KEY, JSON.stringify(keys));
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

/** 消したときだけ知らせる。無いのに知らせると、知らせを受けて登録を確かめ直す AuthGate が、登録の前の人で
 * 「確かめる → 404 で消す → 知らせる」を繰り返す */
export function clearCachedAppUser() {
  try {
    if (localStorage.getItem(APP_USER_KEY) === null) return;
    localStorage.removeItem(APP_USER_KEY);
  } catch {
    // 消せなくても、sub が違えば使われない
    return;
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

const NUMBER_PAD_KEY = "numberPadInput";

/** 前回のゲームを点だけ入力で始めたか。設定の画面のチェックの既定にする */
export function saveLastNumberPad(numberPad: boolean) {
  try {
    localStorage.setItem(NUMBER_PAD_KEY, JSON.stringify(numberPad));
  } catch {
    // 保存できなければ、次は的で入れる既定になるだけ
  }
}

export function loadLastNumberPad(): boolean {
  try {
    return JSON.parse(localStorage.getItem(NUMBER_PAD_KEY) ?? "false") === true;
  } catch {
    return false;
  }
}

const AIM_SETTINGS_KEY = "aimSettings";

export function saveAimSettings(settings: AimSettings) {
  try {
    localStorage.setItem(AIM_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなければ、記入画面は既定の倍率・感度で動く
  }
}

/** 記入画面のズームの倍率と感度。保存が無い・壊れていれば既定の値 */
export function loadAimSettings(): AimSettings {
  try {
    const raw = localStorage.getItem(AIM_SETTINGS_KEY);
    if (!raw) return DEFAULT_AIM_SETTINGS;
    const settings = { ...DEFAULT_AIM_SETTINGS, ...(JSON.parse(raw) as Partial<AimSettings>) };
    return isValidAimSettings(settings) ? settings : DEFAULT_AIM_SETTINGS;
  } catch {
    return DEFAULT_AIM_SETTINGS;
  }
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

/**
 * 入力の途中のゲームは利用者ごとのキーに置く。同じ端末で別の人がログインして始めても、前の人の
 * 保存していない記録を上書きしない
 */
function scoreSheetKey(sub: string) {
  return `scoreSheet:${sub}`;
}

/** 利用者ごとのキーに分ける前のキー。残っていれば、続きを失わないよう今の利用者のものとして読む */
const LEGACY_SCORE_SHEET_KEY = "scoreSheet";

/** localStorage に残っているかもしれない、古い形も含めたキャッシュ */
type StoredScoreSheetCache = Omit<ScoreSheetCache, "sub" | "sheet" | "numberPad"> & {
  /** 点だけ入力を足す前のキャッシュには無い(的で入れていたもの) */
  numberPad?: boolean;
  sheet: Omit<Sheet, "arrow_diameter_mm" | "all_in" | "backfilled"> & {
    /** 矢の直径を px で持っていたころのキャッシュには無い */
    arrow_diameter_mm?: number | null;
    /** 矢の直径を px で持っていたころの欄。的の大きさが分からず mm に直せないので捨て、既定の太さにする */
    arrow_diameter_px?: number | null;
    /** インサイドアウトを足す前のキャッシュには無い */
    all_in?: boolean;
    /** あとから入力を足す前のキャッシュには無い */
    backfilled?: boolean;
  };
};

function readStoredScoreSheetCache(key: string): StoredScoreSheetCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as StoredScoreSheetCache | null;
    if (
      !parsed ||
      parsed.version !== SCORE_SHEET_CACHE_VERSION ||
      !Array.isArray(parsed.sheet?.rounds)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** sub の人の入力の途中のゲーム(lib/score/scoreSheetCache.ts)。古い形は今の形に移して返す */
export function loadScoreSheetCache(sub: string): ScoreSheetCache | null {
  const stored =
    readStoredScoreSheetCache(scoreSheetKey(sub)) ??
    readStoredScoreSheetCache(LEGACY_SCORE_SHEET_KEY);
  if (!stored) return null;
  const { arrow_diameter_px: _, ...sheet } = stored.sheet;
  return {
    ...stored,
    sub,
    numberPad: stored.numberPad ?? false,
    sheet: {
      ...sheet,
      arrow_diameter_mm: sheet.arrow_diameter_mm ?? null,
      all_in: sheet.all_in ?? false,
      backfilled: sheet.backfilled ?? false,
      // db の的の名前はマイグレーションで変えたので、送ると変えたとみなされて弾かれないよう合わせる
      rounds: sheet.rounds.map((round) => ({
        ...round,
        target_type: currentTargetTypeId(round.target_type),
      })),
    },
    setup: stored.setup && {
      ...stored.setup,
      targetType: selectableTargetTypeId(stored.setup.targetType),
    },
  };
}

export function saveScoreSheetCache({ sub, ...cache }: Omit<ScoreSheetCache, "version">) {
  try {
    localStorage.setItem(
      scoreSheetKey(sub),
      JSON.stringify({ ...cache, version: SCORE_SHEET_CACHE_VERSION }),
    );
    localStorage.removeItem(LEGACY_SCORE_SHEET_KEY);
  } catch {
    // 書けなくても(容量切れなど)画面の中の記録はあり、保存・終了で API に送れる
  }
}

export function clearScoreSheetCache(sub: string) {
  try {
    localStorage.removeItem(scoreSheetKey(sub));
    localStorage.removeItem(LEGACY_SCORE_SHEET_KEY);
  } catch {
    // 消せなくても、次に始めるときに上書きする
  }
}
