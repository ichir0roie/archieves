"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/lib/text";

export type PickerOption = { value: string; label: string };

type Props = {
  id?: string;
  /** モーダルの見出し。 */
  title: string;
  options: ReadonlyArray<PickerOption>;
  value: string;
  onChange: (value: string) => void;
  /** 選んでいないとき(value が "")に出す文言。"" を選べる選択肢として先頭にも出す。 */
  emptyLabel: string;
};

// 選択肢がこれより多ければ、モーダルの上に絞り込みの欄を出す
const FILTER_THRESHOLD = 12;

/** select の代わり。押すとモーダルを開き、選択肢を大きなボタンで並べる(スマホで押しやすいように)。 */
export default function Picker({ id, title, options, value, onChange, emptyLabel }: Props) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = options.find((option) => option.value === value);
  const shown = options.filter((option) => option.label.includes(filter.trim()));

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setFilter("");
  }

  return (
    <>
      <button
        id={id}
        type="button"
        className={`picker-toggle ${selected ? "" : "empty"}`}
        onClick={() => setOpen(true)}
      >
        <span className="picker-label">{selected?.label ?? emptyLabel}</span>
        <span
          className="picker-caret"
          aria-hidden="true"
        >
          ▼
        </span>
      </button>
      {open && (
        <Modal
          title={title}
          onClose={() => setOpen(false)}
          wide={options.length > FILTER_THRESHOLD}
        >
          {options.length > FILTER_THRESHOLD && (
            <input
              type="search"
              className="picker-filter"
              placeholder={T.filter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoFocus
            />
          )}
          <div className="picker-grid">
            <button
              type="button"
              className={`picker-option none ${value === "" ? "selected" : ""}`}
              onClick={() => choose("")}
            >
              {emptyLabel}
            </button>
            {shown.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`picker-option ${option.value === value ? "selected" : ""}`}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="muted">{T.noMatch}</p>}
        </Modal>
      )}
    </>
  );
}
