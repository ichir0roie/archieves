"use client";

type Option<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  options: ReadonlyArray<Option<V>>;
  value: V;
  onChange: (value: V) => void;
  /** 読み上げ・テストで引くための名前(見出しの代わり)。 */
  label?: string;
  /** 右端に足す「その他」のボタン。選択肢にない値のときは on にして、押すと入力のモーダルを開く。 */
  other?: { label: string; on: boolean; onClick: () => void };
};

/** 選択肢の少ない択一を、横に並べたボタンで選ぶ。 */
export default function Segment<V extends string>({ options, value, onChange, label, other }: Props<V>) {
  return (
    <div
      className="segment"
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "on" : ""}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
      {other && (
        <button
          type="button"
          className={other.on ? "on" : ""}
          aria-pressed={other.on}
          onClick={other.onClick}
        >
          {other.label}
        </button>
      )}
    </div>
  );
}
