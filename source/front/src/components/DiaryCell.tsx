import type { ReactNode } from "react";
import type { DiaryRead } from "@/lib/api";
import { useT } from "@/lib/text";

type Props = {
  diary: DiaryRead;
  date: ReactNode;
  /** 渡すと日付の横に編集のボタンを出す(本人の日記だけ。プロフィールでは渡さない) */
  onEdit?: (diary: DiaryRead) => void;
};

/** 日記の一件。日付を上に、本文を下に置く。入力の画面の直近・一覧・プロフィールで使う */
export default function DiaryCell({ diary, date, onEdit }: Props) {
  const T = useT();

  return (
    <article className="DiaryCell">
      <div className="DiaryCell-head">
        <div className="DiaryCell-date">{date}</div>
        {onEdit && (
          <button
            type="button"
            className="DiaryCell-edit ghost"
            onClick={() => onEdit(diary)}
          >
            {T.diary.edit}
          </button>
        )}
      </div>
      <p className="DiaryCell-body pre-wrap">{diary.body}</p>
    </article>
  );
}
