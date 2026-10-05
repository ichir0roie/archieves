import type { ReactNode } from "react";

type Props = {
  title: string;
  /** 見出しの右に並べる操作(ボタンなど)。 */
  actions?: ReactNode;
};

/** 画面の見出しの行。左上(スマホは右下)に浮かぶメニューのボタンの分を空けて置く。 */
export default function PageHeader({ title, actions }: Props) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {actions}
    </header>
  );
}
