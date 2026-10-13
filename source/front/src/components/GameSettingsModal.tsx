"use client";

import { useState } from "react";
import GameSetupFields, {
  parseGameSetupDraft,
  toGameSetupDraft,
  type GameSetupMinSizes,
} from "@/components/GameSetupFields";
import Modal from "@/components/Modal";
import type { RoundSetup } from "@/lib/score/scoreConfig";
import { useT } from "@/lib/text";

type Props = {
  setup: RoundSetup;
  minSizes: GameSetupMinSizes;
  onClose: () => void;
  onSave: (setup: RoundSetup) => void;
};

/** 記入画面から開く、記録の途中のゲームの設定のモーダル。決定を押すまで当てない */
export default function GameSettingsModal(props: Props) {
  const T = useT();
  const [draft, setDraft] = useState(() => toGameSetupDraft(props.setup));
  const setup = parseGameSetupDraft(draft, props.minSizes);

  return (
    <Modal
      title={T.game.entry.gameSettings}
      onClose={props.onClose}
      actions={
        <>
          <button
            type="button"
            onClick={props.onClose}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={setup === null}
            onClick={() => {
              if (setup !== null) props.onSave(setup);
            }}
          >
            {T.game.setup.ok}
          </button>
        </>
      }
    >
      <div className="GameSettings stack">
        <p className="hint">{T.game.entry.gameSettingsHint}</p>
        <GameSetupFields
          draft={draft}
          onChange={setDraft}
          minSizes={props.minSizes}
        />
      </div>
    </Modal>
  );
}
