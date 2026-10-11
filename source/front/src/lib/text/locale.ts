import { useSyncExternalStore } from "react";

export const LOCALES = ["ja", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** 設定していない端末の言語。ブラウザの言語には合わせない(画面の文言を端末ごとに揺らさない) */
export const DEFAULT_LOCALE: Locale = "ja";

const LOCALE_KEY = "locale";
const CHANGE_EVENT = "localeChange";

// localStorage が使えないときだけ使う、このタブの間の言語
let memoryLocale: Locale | null = null;

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** 保存した言語(localStorage にキャッシュしている)。未設定や読めないときは既定の言語 */
export function getLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // 保存できなくても、この画面の間は反映される
    memoryLocale = locale;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 今の言語。saveLocale で保存できなかったときの、このタブの間の言語も含む */
export function readLocale(): Locale {
  return memoryLocale ?? getLocale();
}

/** 言語が変わったら(このタブの saveLocale・別のタブでの書き換え)呼ぶ。React の外で言語に合わせるもの向け */
export function subscribeLocale(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 今の言語。サーバーでの描画中は localStorage を読めないので既定の言語を返す */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}
