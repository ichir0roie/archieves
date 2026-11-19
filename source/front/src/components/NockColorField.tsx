"use client";

import { useState } from "react";
import NockColorRegistration from "@/components/NockColorRegistration";
import { useT } from "@/lib/text";

type Props = {
  /** 登録したノックの色(#rrggbb)。無ければ null */
  value: string | null;
  onChange: (value: string) => void;
};

/**
 * ノックの色の欄。登録した色を出し、「矢の色登録」で矢の写真から測り直す(NockColorRegistration)。
 * 写真モードは、これが無いと始められない
 */
export default function NockColorField({ value, onChange }: Props) {
  const T = useT();
  const text = T.game.setup;
  const [open, setOpen] = useState(false);
  return (
    <div className="NockColorField field">
      <span className="field-label">{text.nockColor}</span>
      <div className="nock-color-row">
        {value ? (
          <span
            className="NockColorSwatch nock-swatch large"
            style={{ background: value }}
            role="img"
            aria-label={text.nockColorRegistered(value)}
          />
        ) : (
          <span className="NockColorUnregistered muted">{text.nockColorUnregistered}</span>
        )}
        <button
          type="button"
          className="NockColorRegister"
          onClick={() => setOpen(true)}
        >
          {text.nockColorRegister}
        </button>
      </div>
      <span className="hint">{text.nockColorHint}</span>
      {open && (
        <NockColorRegistration
          onClose={() => setOpen(false)}
          onSave={(nockColor) => {
            onChange(nockColor);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
