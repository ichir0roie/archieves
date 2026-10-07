import type { GameRead } from "@/lib/score/scoreManager";

export const NO_DATE_KEY = "none";

export type DayGroup = { key: string; day: string; games: Array<GameRead> };
export type MonthGroup = {
  key: string;
  month: string;
  count: number;
  days: Array<DayGroup>;
};
export type YearGroup = {
  key: string;
  year: string;
  count: number;
  months: Array<MonthGroup>;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ゲームを 年 → 月 → 日 に分ける。新しい日付が先。日付の読めないゲームは最後の「日付なし」に入れる */
export function groupGamesByDate(games: Array<GameRead>): {
  years: Array<YearGroup>;
  undated: Array<GameRead>;
} {
  const years = new Map<string, Map<string, Map<string, Array<GameRead>>>>();
  const undated: Array<GameRead> = [];

  for (const game of games) {
    const date = game.recorded_at ? new Date(game.recorded_at) : null;
    if (!date || Number.isNaN(date.getTime())) {
      undated.push(game);
      continue;
    }
    const year = String(date.getFullYear());
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const months =
      years.get(year) ?? new Map<string, Map<string, Array<GameRead>>>();
    const days = months.get(month) ?? new Map<string, Array<GameRead>>();
    days.set(day, [...(days.get(day) ?? []), game]);
    months.set(month, days);
    years.set(year, months);
  }

  const descending = (a: string, b: string) => b.localeCompare(a);
  const result: Array<YearGroup> = [...years.entries()]
    .sort(([a], [b]) => descending(a, b))
    .map(([year, months]) => {
      const monthGroups: Array<MonthGroup> = [...months.entries()]
        .sort(([a], [b]) => descending(a, b))
        .map(([month, days]) => {
          const dayGroups: Array<DayGroup> = [...days.entries()]
            .sort(([a], [b]) => descending(a, b))
            .map(([day, dayGames]) => ({
              key: `${year}-${month}-${day}`,
              day,
              games: dayGames,
            }));
          return {
            key: `${year}-${month}`,
            month,
            count: dayGroups.reduce(
              (sum, group) => sum + group.games.length,
              0,
            ),
            days: dayGroups,
          };
        });
      return {
        key: year,
        year,
        count: monthGroups.reduce((sum, group) => sum + group.count, 0),
        months: monthGroups,
      };
    });

  return { years: result, undated };
}

/** 全部の見出しのキー */
export function allGroupKeys(groups: {
  years: Array<YearGroup>;
  undated: Array<GameRead>;
}): Array<string> {
  const keys = groups.years.flatMap((year) => [
    year.key,
    ...year.months.flatMap((month) => [
      month.key,
      ...month.days.map((day) => day.key),
    ]),
  ]);
  return groups.undated.length > 0 ? [...keys, NO_DATE_KEY] : keys;
}
