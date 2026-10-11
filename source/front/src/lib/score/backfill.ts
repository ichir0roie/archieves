import { toDateOnly } from "@/lib/toDateOnly";

/** あとから入力の日付を、設定の画面へ渡す URL の引数の名前 */
export const BACKFILL_DATE_PARAM = "date";

/** 入力の画面の帯に出す、月と日だけの短い日付("2026-09-20" → ja-JP なら "9/20")。locale は T.intlLocale */
export function shortDate(date: string, locale: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** あとから入力の日付("yyyy-mm-dd")として使えるか。無い日(2 月 30 日など)と、今日より後の日は弾く */
export function isBackfillDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (toDateOnly(new Date(`${value}T00:00:00`)) !== value) return false;
  // 同じ形の文字列なので、文字の順で日付の前後を比べられる
  return value <= toDateOnly(new Date());
}
