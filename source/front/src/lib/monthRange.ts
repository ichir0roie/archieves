/** Converts a monthly input value like YYYY/MM to a "yyyy-mm-dd" boundary, inclusive on both ends. */
export function toIsoMonthBound(
  monthValue: string,
  boundary: "start" | "end",
): string | undefined {
  if (!monthValue) return undefined;

  const match = /^\s*(\d{4})\/(\d{1,2})\s*$/.exec(monthValue);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;

  if (boundary === "start") {
    return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  }

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
  return lastDayOfMonth.toISOString().slice(0, 10);
}

/** "yyyy-mm-dd" start/end bounds for the current calendar month, in the local timezone. */
export function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const monthValue = `${now.getFullYear()}/${now.getMonth() + 1}`;
  return {
    start: toIsoMonthBound(monthValue, "start") as string,
    end: toIsoMonthBound(monthValue, "end") as string,
  };
}

/** "yyyy-mm-dd" start/end bounds for the current calendar year, in the local timezone. */
export function currentYearRange(now: Date = new Date()): { start: string; end: string } {
  const year = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export type RangePreset = "year" | "month" | "all";

function toLocalIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** プリセットの期間("yyyy-mm-dd"、ローカルのタイムゾーン)。全期間は絞り込まないので空。 */
export function presetRange(
  preset: RangePreset,
  now: Date = new Date(),
): { start?: string; end?: string } {
  if (preset === "all") return {};

  const start = new Date(now);
  if (preset === "year") {
    start.setFullYear(start.getFullYear() - 1);
  } else {
    // 3/31 の 1 か月前が 3/3 に繰り上がらないよう、日を 1 にしてから月を戻し、末日を超えない日に直す
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - 1);
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
  }
  return {
    start: toLocalIsoDate(start),
    end: toLocalIsoDate(now),
  };
}
