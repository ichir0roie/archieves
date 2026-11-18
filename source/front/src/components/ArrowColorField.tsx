"use client";

import type { ArrowColor } from "@/lib/api";
import { ARROW_COLORS } from "@/lib/score/scoreConfig";
import { useT } from "@/lib/text";

type Props = {
  label: string;
  /** 読み上げ・テストで引くための class */
  className: string;
  value: ArrowColor | null;
  onChange: (value: ArrowColor | null) => void;
  hint?: string;
};

/** 矢のノック・羽根の色を、色の丸を並べて選ぶ。選ばない(null)こともできる */
export default function ArrowColorField({ label, className, value, onChange, hint }: Props) {
  const T = useT();
  return (
    <div className={`${className} field`}>
      <span className="field-label">{label}</span>
      <div
        className="arrow-colors"
        role="group"
        aria-label={label}
      >
        <button
          type="button"
          className={value === null ? "arrow-color none on" : "arrow-color none"}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          {T.game.setup.arrowColorNone}
        </button>
        {ARROW_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={value === color ? `arrow-color swatch-${color} on` : `arrow-color swatch-${color}`}
            aria-pressed={value === color}
            aria-label={T.game.setup.arrowColors[color]}
            title={T.game.setup.arrowColors[color]}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
