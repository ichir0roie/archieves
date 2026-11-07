"use client";

import { useEffect, useMemo, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import DiaryCell from "@/components/DiaryCell";
import DiaryEditModal from "@/components/DiaryEditModal";
import LogGroup from "@/components/LogGroup";
import PageHeader from "@/components/PageHeader";
import YearSwitcher from "@/components/YearSwitcher";
import { useLoad } from "@/hooks/useLoad";
import { listDiaries, listDiaryYears, type DiaryRead } from "@/lib/api";
import { groupDiariesByMonth } from "@/lib/diary";
import { loadDiaryLogCollapsed, saveDiaryLogCollapsed } from "@/lib/storage";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  // null のあいだは、日記のある一番新しい年を出す
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [editing, setEditing] = useState<DiaryRead | null>(null);
  // 直した・消したあとに読み直すための鍵
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useLoad(async () => {
    const years = await listDiaryYears();
    // 選んでいた年の日記を全部消したら、その年はもう無いので一番新しい年に戻す
    const year =
      selectedYear !== null && years.includes(selectedYear) ? selectedYear : (years[0] ?? null);
    const diaries = year === null ? [] : await listDiaries({ year });
    return { years, year, diaries };
  }, [selectedYear, version]);
  const years = data?.years ?? [];
  const year = data?.year ?? null;
  const months = useMemo(() => groupDiariesByMonth(data?.diaries ?? []), [data]);
  const yearIndex = year === null ? -1 : years.indexOf(year);
  const [collapsed, setCollapsed] = useState<Array<string>>([]);

  // サーバーでの描画中は localStorage を読めないので、前回の開閉は画面に載ってから当てる
  useEffect(() => {
    setCollapsed(loadDiaryLogCollapsed());
  }, []);

  function updateCollapsed(keys: Array<string>) {
    setCollapsed(keys);
    saveDiaryLogCollapsed(keys);
  }

  // 月の見出しの下に並ぶので、日付は「日 時:分」だけにする
  function formatDay(iso: string): string {
    const date = new Date(iso);
    const time = new Intl.DateTimeFormat(T.intlLocale, { timeStyle: "short" }).format(date);
    return `${T.profile.scoreLog.day(String(date.getDate()))} ${time}`;
  }

  function toggle(key: string) {
    updateCollapsed(
      collapsed.includes(key)
        ? collapsed.filter((k) => k !== key)
        : [...collapsed, key],
    );
  }

  return (
    <div className="page">
      <PageHeader title={T.diary.listTitle} />
      {error && <ApiErrorAlert error={error} />}
      {loading && !data && <p className="status empty">{T.loading}</p>}
      {data && years.length === 0 && (
        <p className="status empty">{T.diary.empty}</p>
      )}
      {year !== null && (
        <>
          <YearSwitcher
            year={year}
            older={years[yearIndex + 1] ?? null}
            newer={yearIndex > 0 ? years[yearIndex - 1] : null}
            onChange={setSelectedYear}
          />
          <div className="log-toolbar">
            <button
              type="button"
              onClick={() => updateCollapsed(months.map((month) => month.key))}
            >
              {T.profile.scoreLog.collapseAll}
            </button>
            <button
              type="button"
              onClick={() => updateCollapsed([])}
            >
              {T.profile.scoreLog.expandAll}
            </button>
          </div>
          {months.map((month) => (
            <LogGroup
              key={month.key}
              title={T.profile.scoreLog.month(month.month)}
              count={T.profile.scoreLog.count(month.diaries.length)}
              open={!collapsed.includes(month.key)}
              onToggle={() => toggle(month.key)}
            >
              <div className="DiaryCells">
                {month.diaries.map((diary) => (
                  <DiaryCell
                    key={diary.id}
                    diary={diary}
                    date={formatDay(diary.created_at)}
                    onEdit={setEditing}
                  />
                ))}
              </div>
            </LogGroup>
          ))}
        </>
      )}
      {editing && (
        <DiaryEditModal
          diary={editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <BackButton />
    </div>
  );
}
