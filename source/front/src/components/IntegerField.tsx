"use client";

import type { ReactNode } from "react";
import Field from "@/components/Field";
import { useT } from "@/lib/text";

/** 入力の文字を、min〜max の整数に読む。読めなければ null。全角の数字も受ける(日本語入力のまま打つため) */
export function parseInteger(text: string, min: number, max: number): number | null {
  const normalized = text
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= min && value <= max ? value : null;
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  hint?: string;
  /** 欄の右に並べるもの(矢の直径のサイトの見本) */
  aside?: ReactNode;
  /** モーダルで、開いたらすぐ打てるようにする */
  autoFocus?: boolean;
};

/** 整数の欄。数は文字のまま持たせ、読めない間はその場でエラーを出す */
export default function IntegerField(props: Props) {
  const T = useT();
  const invalid = parseInteger(props.value, props.min, props.max) === null;
  return (
    <Field
      label={props.label}
      hint={props.hint}
      error={invalid ? T.game.setup.integerError(props.min, props.max) : null}
    >
      {(id) => (
        <div className="row">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            className="grow"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            aria-invalid={invalid}
            autoFocus={props.autoFocus}
          />
          {props.aside}
        </div>
      )}
    </Field>
  );
}
