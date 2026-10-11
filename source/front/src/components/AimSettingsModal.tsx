"use client";

import { useState } from "react";
import IntegerField, { parseInteger } from "@/components/IntegerField";
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

type Props = {
  settings: AimSettings;
  onClose: () => void;
  /** 決定を押したとき。端末に保存したあとで呼ぶ */
  onSave: (settings: AimSettings) => void;
};

/** 記入画面から開く、ズームの倍率・大きさ・感度のモーダル。決定を押すまで当てない */
export default function AimSettingsModal(props: Props) {
  const T = useT();
  const [lensZoomText, setLensZoomText] = useState(String(props.settings.lensZoom));
  const [lensSizePercentText, setLensSizePercentText] = useState(
    String(props.settings.lensSizePercent),
  );
  const [aimDivisorText, setAimDivisorText] = useState(String(props.settings.aimDivisor));

  const lensZoom = parseInteger(lensZoomText, MIN_LENS_ZOOM, MAX_LENS_ZOOM);
  const lensSizePercent = parseInteger(
    lensSizePercentText,
    MIN_LENS_SIZE_PERCENT,
    MAX_LENS_SIZE_PERCENT,
  );
  const aimDivisor = parseInteger(aimDivisorText, MIN_AIM_DIVISOR, MAX_AIM_DIVISOR);
  const settings =
    lensZoom !== null && lensSizePercent !== null && aimDivisor !== null
      ? {
          lensZoom,
          aimDivisor,
          lensSizePercent,
        }
      : null;

  function submit() {
    if (settings === null) return;
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
          disabled={settings === null}
          onClick={submit}
        >
          {T.game.setup.ok}
        </button>
      }
    >
      <div className="stack">
        <IntegerField
          label={T.game.setup.lensZoom}
          value={lensZoomText}
          onChange={setLensZoomText}
          min={MIN_LENS_ZOOM}
          max={MAX_LENS_ZOOM}
        />
        <IntegerField
          label={T.game.setup.lensSize}
          value={lensSizePercentText}
          onChange={setLensSizePercentText}
          min={MIN_LENS_SIZE_PERCENT}
          max={MAX_LENS_SIZE_PERCENT}
          hint={T.game.setup.lensSizeHint}
        />
        <IntegerField
          label={T.game.setup.aimDivisor}
          value={aimDivisorText}
          onChange={setAimDivisorText}
          min={MIN_AIM_DIVISOR}
          max={MAX_AIM_DIVISOR}
          hint={T.game.setup.aimDivisorHint(aimDivisor)}
        />
      </div>
    </Modal>
  );
}
