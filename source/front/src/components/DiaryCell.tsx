import type { ReactNode } from "react";
import type { DiaryRead } from "@/lib/api";

type Props = {
  diary: DiaryRead;
  date: ReactNode;
};

/** 日記の一件。日付を上に、本文を下に置く。入力の画面の直近と一覧の両方で使う */
export default function DiaryCell({ diary, date }: Props) {
  return (
    <article className="DiaryCell">
      <div className="DiaryCell-date">{date}</div>
      <p className="DiaryCell-body pre-wrap">{diary.body}</p>
    </article>
  );
}
