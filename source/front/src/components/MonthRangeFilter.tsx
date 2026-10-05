"use client";

import type { ReactNode } from "react";
import Field from "@/components/Field";
import { T } from "@/lib/text";

type Props = {
  startMonth: string;
  endMonth: string;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  /** 月の範囲より前に並べる絞り込みの欄(ランキングの所属・地域など)。 */
  children?: ReactNode;
};

/** 統計ダッシュボードとランキングで共通の「開始月・終了月 + 適用・リセット」の絞り込み。 */
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
    <div className="panel toolbar">
      {children}
      <Field label={T.stats.filter.startMonth}>
        {(id) => (
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={startMonth}
            onChange={(e) => onStartMonthChange(e.target.value)}
            placeholder={T.stats.filter.monthPlaceholder}
          />
        )}
      </Field>
      <Field label={T.stats.filter.endMonth}>
        {(id) => (
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={endMonth}
            onChange={(e) => onEndMonthChange(e.target.value)}
            placeholder={T.stats.filter.monthPlaceholder}
          />
        )}
      </Field>
      <button
        type="button"
        className="primary"
        onClick={onApply}
      >
        {T.apply}
      </button>
      <button
        type="button"
        onClick={onReset}
      >
        {T.reset}
      </button>
    </div>
  );
}
