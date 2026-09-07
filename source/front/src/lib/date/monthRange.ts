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
