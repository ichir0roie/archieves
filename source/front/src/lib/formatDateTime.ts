import { getT } from "./text";

/** API の日時(ISO 8601)を、手元の時刻で「日付 時:分」にする。 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(getT().intlLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
