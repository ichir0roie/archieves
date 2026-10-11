"use client";

import { useState } from "react";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import {
  MAX_AIM_DIVISOR,
  MAX_LENS_SIZE_PERCENT,
  MAX_LENS_ZOOM,
  MIN_AIM_DIVISOR,
  MIN_LENS_SIZE_PERCENT,
  MIN_LENS_ZOOM,
  type AimSettings,
} from "@/lib/score/scoreConfig";
import { saveAimSettings } from "@/lib/storage";
import { useT } from "@/lib/text";

type RangeFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  hint?: string;
};

/** 整数のスライダーの欄。今の値を見出しの右に出す */
function RangeField(props: RangeFieldProps) {
  return (
    <Field
      label={props.label}
      hint={props.hint}
    >
      {(id) => (
        <div className="RangeField row">
          <input
            id={id}
            type="range"
            className="grow"
            min={props.min}
            max={props.max}
            step={1}
            value={props.value}
            onChange={(e) => props.onChange(Number(e.target.value))}
          />
          <output
            htmlFor={id}
            className="range-value"
          >
            {props.value}
          </output>
        </div>
      )}
    </Field>
  );
}

type Props = {
  settings: AimSettings;
  onClose: () => void;
  /** 決定を押したとき。端末に保存したあとで呼ぶ */
  onSave: (settings: AimSettings) => void;
};

/** 記入画面から開く、ズームの倍率・大きさ・感度のモーダル。決定を押すまで当てない */
export default function AimSettingsModal(props: Props) {
  const T = useT();
  const [settings, setSettings] = useState(props.settings);

  function submit() {
    saveAimSettings(settings);
    props.onSave(settings);
  }

  return (
    <Modal
      title={T.game.entry.aimSettings}
      onClose={props.onClose}
      actions={
        <button
          type="button"
          className="primary"
          onClick={submit}
        >
          {T.game.setup.ok}
        </button>
      }
    >
      <div className="stack">
        <RangeField
          label={T.game.setup.lensZoom}
          value={settings.lensZoom}
          onChange={(lensZoom) => setSettings({ ...settings, lensZoom })}
          min={MIN_LENS_ZOOM}
          max={MAX_LENS_ZOOM}
          hint={T.game.setup.lensZoomHint}
        />
        <RangeField
          label={T.game.setup.lensSize}
          value={settings.lensSizePercent}
          onChange={(lensSizePercent) => setSettings({ ...settings, lensSizePercent })}
          min={MIN_LENS_SIZE_PERCENT}
          max={MAX_LENS_SIZE_PERCENT}
          hint={T.game.setup.lensSizeHint}
        />
        <RangeField
          label={T.game.setup.aimDivisor}
          value={settings.aimDivisor}
          onChange={(aimDivisor) => setSettings({ ...settings, aimDivisor })}
          min={MIN_AIM_DIVISOR}
          max={MAX_AIM_DIVISOR}
          hint={T.game.setup.aimDivisorHint(settings.aimDivisor)}
        />
        <div className="field">
          <label className="AlwaysShowSightField check-field">
            <input
              type="checkbox"
              checked={settings.alwaysShowSight}
              onChange={(e) => setSettings({ ...settings, alwaysShowSight: e.target.checked })}
            />
            {T.game.setup.alwaysShowSight}
          </label>
          <span className="hint">{T.game.setup.alwaysShowSightHint}</span>
        </div>
      </div>
    </Modal>
  );
}
