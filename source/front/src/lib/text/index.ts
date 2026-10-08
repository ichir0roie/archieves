/**
 * 画面に出す文言をすべてここに集める。コンポーネントに文言を直に書かない。
 * - 言語ごとに ja/・en/ に置く。ja が型の元で、en は同じ形でなければ型が通らない
 * - 同じものを指す語は ja/terms.ts・en/terms.ts(用語集)で一つに決め、文言はそこから組み立てる
 * - 数などを差し込むものは関数にする
 * - db の値(利用者の名前・団体名など)はここに置かない
 * - 言語は設定画面で選び、localStorage に保存する(locale.ts)
 *
 * コンポーネントは `const T = useT();` で今の言語の文言を受ける(言語を変えると描き直される)。
 * コンポーネントの外(クラス・サーバー)は `getT()` で、その時点の言語の文言を一度だけ引く。
 */
import { useEffect } from "react";
import { texts as en } from "./en";
import { texts as ja } from "./ja";
import { DEFAULT_LOCALE, getLocale, useLocale, type Locale } from "./locale";

export { DEFAULT_LOCALE, LOCALES, getLocale, saveLocale, useLocale, type Locale } from "./locale";

export type Texts = typeof ja;

const TEXTS: Record<Locale, Texts> = { ja, en };

export function textsFor(locale: Locale): Texts {
  return TEXTS[locale];
}

/** 画面の外から使う。サーバーでは localStorage が無いので既定の言語になる */
export function getT(): Texts {
  return typeof window === "undefined" ? TEXTS[DEFAULT_LOCALE] : TEXTS[getLocale()];
}

export function useT(): Texts {
  return TEXTS[useLocale()];
}

/** <html lang> を今の言語に合わせる(読み上げ・ハイフネーションが言語を見る) */
export function useSyncHtmlLang() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
