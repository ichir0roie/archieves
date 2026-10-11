import type { DiaryRead } from "@/lib/api";

/** 日記の最大の長さ。API の app/core/diary.py の MAX_DIARY_LENGTH と揃える */
export const MAX_DIARY_LENGTH = 10000;

/** 入力の画面に出す直近の件数 */
export const RECENT_DIARY_LIMIT = 10;

export type DiaryMonthGroup = { key: string; month: string; diaries: Array<DiaryRead> };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 一年分の日記を月に分ける。API が新しい順で返すので、月も中身もその順のまま */
export function groupDiariesByMonth(diaries: Array<DiaryRead>): Array<DiaryMonthGroup> {
  const months = new Map<string, DiaryMonthGroup>();
  for (const diary of diaries) {
    const date = new Date(diary.created_at);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    const group = months.get(key) ?? { key, month: pad(date.getMonth() + 1), diaries: [] };
    group.diaries.push(diary);
    months.set(key, group);
  }
  return [...months.values()];
}
