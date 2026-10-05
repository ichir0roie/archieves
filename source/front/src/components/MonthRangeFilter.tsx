"use client";

import { ReactNode } from "react";

interface Props {
  startMonth: string;
  endMonth: string;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  /** Extra filter fields rendered before the month range, e.g. Ranking's organization/region selects. */
  children?: ReactNode;
}

/** Shared "開始月/終了月 + 適用/リセット" filter bar used by the Analysis and Ranking pages. */
export default function MonthRangeFilter({
  startMonth,
  endMonth,
  onStartMonthChange,
  onEndMonthChange,
  onApply,
  onReset,
  children,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
      {children}
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        開始月
        <input
          type="text"
          inputMode="numeric"
          value={startMonth}
          onChange={(e) => onStartMonthChange(e.target.value)}
          placeholder="YYYY/MM"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        終了月
        <input
          type="text"
          inputMode="numeric"
          value={endMonth}
          onChange={(e) => onEndMonthChange(e.target.value)}
          placeholder="YYYY/MM"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <button
        onClick={onApply}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        適用
      </button>
      <button
        onClick={onReset}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
      >
        リセット
      </button>
    </div>
  );
}
