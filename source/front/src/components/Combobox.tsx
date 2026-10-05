"use client";

import { useState } from "react";

export type ComboboxOption = { id: number; label: string };

type Props = {
  id?: string;
  value: string;
  /** 打った文字。打つたびに呼ぶので、呼ぶ側はここで選んでいた候補を外す。 */
  onInput: (text: string) => void;
  /** 候補を選んだ。 */
  onSelect: (option: ComboboxOption) => void;
  options: ReadonlyArray<ComboboxOption>;
};

/** 打ちながら候補を出す入力。候補に無い文字もそのまま打ち込める(呼ぶ側が新しく作るなど)。 */
export default function Combobox({ id, value, onInput, onSelect, options }: Props) {
  const [focused, setFocused] = useState(false);
  const listId = `${id}-options`;
  const open = focused && options.length > 0;

  return (
    <div className="combobox">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => setFocused(true)}
        // 候補を押す前に閉じると押せないので、押し終わるまで待ってから閉じる
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {open && (
        <ul
          id={listId}
          className="combobox-options"
          role="listbox"
        >
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.label === value}
                onClick={() => {
                  onSelect(option);
                  setFocused(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
