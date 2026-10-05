"use client";

import { useId, type ReactNode } from "react";

type Props = {
  label: string;
  /** 欄の下に出す説明。error があればそちらを出す。 */
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** 入力の要素。受け取った id を付けると label と結ばれる(getByLabel で引ける)。 */
  children: (id: string) => ReactNode;
};

/** 見出し・入力・説明の一組。入力の要素は呼ぶ側が選ぶ(input・textarea・Picker など)。 */
export default function Field({ label, hint, error, required, children }: Props) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children(id)}
      {error ? <span className="error">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
