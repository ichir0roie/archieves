"use client";

import ArrowSight from "@/components/ArrowSight";
import { TARGET_FACE_PADDING } from "@/components/TargetCircleInput";
import IntegerField, { parseInteger } from "@/components/IntegerField";
import Modal from "@/components/Modal";
import Segment from "@/components/Segment";
import { useEffect, useState, type ReactNode } from "react";
import {
  BOW_TYPES,
  BOW_TYPE_MAX_LENGTH,
  DISTANCE_PRESETS_M,
  DEFAULT_AIM_SETTINGS,
  MAX_ARROW_DIAMETER_MM,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_ROUND_SIZE,
  MAX_TARGET_SIZE_CM,
  MIN_ARROW_DIAMETER_MM,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_ROUND_SIZE,
  MIN_TARGET_SIZE_CM,
  TARGET_TYPES,
  arrowDiameterPx,
  customTargetTypeId,
  getTargetType,
  resolveTargetType,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import { isInnerTenBow } from "@/lib/score/scoreFunctions";
import { loadAimSettings, loadTargetDiameterPx } from "@/lib/storage";
import { useT } from "@/lib/text";

/** 設定の欄の値。数は文字のまま持ち、読めない間は決定させない(打ちかけの空や範囲外も、そのまま見せて直させる) */
export type GameSetupDraft = {
  bowType: string;
  distanceM: number;
  targetType: string;
  endSizeText: string;
  roundSizeText: string;
  gameSizeText: string;
  arrowDiameterMmText: string;
  allIn: boolean;
};

/** 数の欄の下限。記録の途中のゲームでは、記録した矢・エンド・ラウンドの数より小さくできない */
export type GameSetupMinSizes = {
  endSize: number;
  roundSize: number;
  gameSize: number;
};

const NO_MIN_SIZES: GameSetupMinSizes = {
  endSize: MIN_END_SIZE,
  roundSize: MIN_ROUND_SIZE,
  gameSize: MIN_GAME_SIZE,
};

export function toGameSetupDraft(setup: RoundSetup): GameSetupDraft {
  return {
    bowType: setup.bowType,
    distanceM: setup.distanceM,
    targetType: setup.targetType,
    endSizeText: String(setup.endSize),
    roundSizeText: String(setup.roundSize),
    gameSizeText: String(setup.gameSize),
    arrowDiameterMmText: String(setup.arrowDiameterMm),
    allIn: setup.allIn,
  };
}

function parseSizes(draft: GameSetupDraft, minSizes: GameSetupMinSizes) {
  return {
    endSize: parseInteger(draft.endSizeText, Math.max(MIN_END_SIZE, minSizes.endSize), MAX_END_SIZE),
    roundSize: parseInteger(
      draft.roundSizeText,
      Math.max(MIN_ROUND_SIZE, minSizes.roundSize),
      MAX_ROUND_SIZE,
    ),
    gameSize: parseInteger(
      draft.gameSizeText,
      Math.max(MIN_GAME_SIZE, minSizes.gameSize),
      MAX_GAME_SIZE,
    ),
    arrowDiameterMm: parseInteger(
      draft.arrowDiameterMmText,
      MIN_ARROW_DIAMETER_MM,
      MAX_ARROW_DIAMETER_MM,
    ),
  };
}

/** 欄の値を設定に読む。読めない欄があれば null */
export function parseGameSetupDraft(
  draft: GameSetupDraft,
  minSizes: GameSetupMinSizes = NO_MIN_SIZES,
): RoundSetup | null {
  const { endSize, roundSize, gameSize, arrowDiameterMm } = parseSizes(draft, minSizes);
  if (endSize === null || roundSize === null || gameSize === null || arrowDiameterMm === null) {
    return null;
  }
  return {
    bowType: draft.bowType,
    distanceM: draft.distanceM,
    targetType: draft.targetType,
    endSize,
    roundSize,
    gameSize,
    arrowDiameterMm,
    allIn: draft.allIn,
  };
}

type OtherModalProps = {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  children: ReactNode;
};

/** 「その他」を押したときの入力のモーダル。決定を押すまで設定には反映しない */
function OtherModal(props: OtherModalProps) {
  const T = useT();
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      actions={
        <button
          type="button"
          className="primary"
          disabled={!props.canSubmit}
          onClick={props.onSubmit}
        >
          {T.game.setup.ok}
        </button>
      }
    >
      {props.children}
    </Modal>
  );
}

const DISTANCE_OPTIONS = DISTANCE_PRESETS_M.map((distanceM) => ({
  value: String(distanceM),
  label: `${distanceM}m`,
}));

type Props = {
  draft: GameSetupDraft;
  onChange: (draft: GameSetupDraft) => void;
  minSizes?: GameSetupMinSizes;
};

/**
 * ゲームの設定の欄(弓・距離・的・矢とエンドとラウンドの数・矢の直径・インサイドアウト)。
 * 始める前の設定の画面と、記入画面のゲームの設定のモーダルで使う
 */
export default function GameSetupFields({ draft, onChange, minSizes = NO_MIN_SIZES }: Props) {
  const T = useT();
  const BOW_OPTIONS = BOW_TYPES.map((bowType) => ({
    value: bowType.id,
    label: T.options.bowType[bowType.id],
  }));
  const TARGET_OPTIONS = TARGET_TYPES.map((targetType) => ({
    value: targetType.id,
    label: T.options.targetType[targetType.id],
  }));

  // サイトの見本を描く倍率。変えるのは記入画面のモーダル(AimSettingsModal)で、ここでは読むだけ
  const [lensZoom, setLensZoom] = useState(DEFAULT_AIM_SETTINGS.lensZoom);
  const [targetDiameterPx, setTargetDiameterPx] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState<"bowType" | "distance" | "targetType" | null>(null);
  const [draftBowName, setDraftBowName] = useState("");
  const [draftDistanceText, setDraftDistanceText] = useState("");
  const [draftTargetSizeText, setDraftTargetSizeText] = useState("");

  // サーバーでの描画中は localStorage を読めないので、画面に載ってから当てる
  useEffect(() => {
    // 記入画面を一度も開いていなければ、的は画面の幅か高さいっぱいに描かれるものとして見積もる
    setTargetDiameterPx(
      loadTargetDiameterPx() ??
        Math.min(window.innerWidth, window.innerHeight) - TARGET_FACE_PADDING * 2,
    );
    setLensZoom(loadAimSettings().lensZoom);
  }, []);

  function update(patch: Partial<GameSetupDraft>) {
    onChange({ ...draft, ...patch });
  }

  const bowIsOther = !BOW_TYPES.some((b) => b.id === draft.bowType);
  const distanceIsOther = !DISTANCE_PRESETS_M.includes(draft.distanceM);
  const targetIsOther = getTargetType(draft.targetType) === undefined;
  const trimmedDraftBowName = draftBowName.trim();
  const draftDistance = parseInteger(draftDistanceText, MIN_DISTANCE_M, MAX_DISTANCE_M);
  const draftTargetSizeCm = parseInteger(
    draftTargetSizeText,
    MIN_TARGET_SIZE_CM,
    MAX_TARGET_SIZE_CM,
  );

  const { endSize, roundSize, gameSize, arrowDiameterMm } = parseSizes(draft, minSizes);
  const previewArrowPx =
    arrowDiameterMm !== null && targetDiameterPx !== null
      ? arrowDiameterPx(
          arrowDiameterMm,
          resolveTargetType(draft.targetType).sizeCm,
          targetDiameterPx,
        )
      : null;

  function openBowOther() {
    setDraftBowName(bowIsOther ? draft.bowType : "");
    setOtherOpen("bowType");
  }

  function openDistanceOther() {
    setDraftDistanceText(distanceIsOther ? String(draft.distanceM) : "");
    setOtherOpen("distance");
  }

  function openTargetOther() {
    setDraftTargetSizeText(
      targetIsOther ? String(resolveTargetType(draft.targetType).sizeCm) : "",
    );
    setOtherOpen("targetType");
  }

  return (
    <>
      <div className="field">
        <span className="field-label">{T.game.setup.bowType}</span>
        <Segment
          options={BOW_OPTIONS}
          value={bowIsOther ? "" : draft.bowType}
          onChange={(bowType) => update({ bowType })}
          label={T.game.setup.bowType}
          other={{
            label: bowIsOther ? T.game.setup.otherValue(draft.bowType) : T.game.setup.other,
            on: bowIsOther,
            onClick: openBowOther,
          }}
        />
        {isInnerTenBow(draft.bowType) && (
          <span className="hint">{T.game.setup.innerTenHint}</span>
        )}
      </div>
      <div className="field">
        <span className="field-label">{T.game.setup.distance}</span>
        <Segment
          options={DISTANCE_OPTIONS}
          value={distanceIsOther ? "" : String(draft.distanceM)}
          onChange={(value) => update({ distanceM: Number(value) })}
          label={T.game.setup.distance}
          other={{
            label: distanceIsOther
              ? T.game.setup.otherValue(`${draft.distanceM}m`)
              : T.game.setup.other,
            on: distanceIsOther,
            onClick: openDistanceOther,
          }}
        />
      </div>
      <div className="field">
        <span className="field-label">{T.game.setup.targetType}</span>
        <Segment
          options={TARGET_OPTIONS}
          value={targetIsOther ? "" : draft.targetType}
          onChange={(targetType) => update({ targetType })}
          label={T.game.setup.targetType}
          other={{
            label: targetIsOther ? T.game.setup.otherValue(draft.targetType) : T.game.setup.other,
            on: targetIsOther,
            onClick: openTargetOther,
          }}
        />
      </div>
      <IntegerField
        label={T.game.setup.endSize}
        value={draft.endSizeText}
        onChange={(endSizeText) => update({ endSizeText })}
        min={Math.max(MIN_END_SIZE, minSizes.endSize)}
        max={MAX_END_SIZE}
        hint={T.game.setup.endSizeHint}
      />
      <IntegerField
        label={T.game.setup.roundSize}
        value={draft.roundSizeText}
        onChange={(roundSizeText) => update({ roundSizeText })}
        min={Math.max(MIN_ROUND_SIZE, minSizes.roundSize)}
        max={MAX_ROUND_SIZE}
        hint={T.game.setup.roundSizeHint}
      />
      <IntegerField
        label={T.game.setup.gameSize}
        value={draft.gameSizeText}
        onChange={(gameSizeText) => update({ gameSizeText })}
        min={Math.max(MIN_GAME_SIZE, minSizes.gameSize)}
        max={MAX_GAME_SIZE}
        hint={T.game.setup.gameSizeHint}
      />
      <IntegerField
        label={T.game.setup.arrowDiameter}
        value={draft.arrowDiameterMmText}
        onChange={(arrowDiameterMmText) => update({ arrowDiameterMmText })}
        min={MIN_ARROW_DIAMETER_MM}
        max={MAX_ARROW_DIAMETER_MM}
        hint={T.game.setup.arrowDiameterHint(previewArrowPx)}
        aside={
          // 記入画面のズームに出すのと同じ部品・同じ大きさ。帯の線への届き方を設定する前に見られる
          <div
            className="SightPreview sight-preview ring-gold"
            role="img"
            aria-label={T.game.setup.sightPreview}
          >
            {previewArrowPx !== null && (
              <ArrowSight
                arrowDiameterPx={previewArrowPx}
                zoom={lensZoom}
                ringClassName="ring-gold"
              />
            )}
          </div>
        }
      />
      <div className="field">
        <label className="AllInField check-field">
          <input
            type="checkbox"
            checked={draft.allIn}
            onChange={(e) => update({ allIn: e.target.checked })}
          />
          {T.terms.allIn}
        </label>
        <span className="hint">{T.game.setup.allInHint}</span>
      </div>

      {endSize !== null && roundSize !== null && gameSize !== null && (
        <p className="SetupSummary game-note muted">
          {T.game.setup.summary(
            endSize * roundSize * gameSize,
            String(endSize),
            String(roundSize),
            String(gameSize),
          )}
        </p>
      )}

      {otherOpen === "bowType" && (
        <OtherModal
          title={T.game.setup.bowTypeOther}
          onClose={() => setOtherOpen(null)}
          canSubmit={trimmedDraftBowName !== ""}
          onSubmit={() => {
            update({ bowType: trimmedDraftBowName });
            setOtherOpen(null);
          }}
        >
          <input
            type="text"
            aria-label={T.game.setup.bowTypeOtherPlaceholder}
            placeholder={T.game.setup.bowTypeOtherPlaceholder}
            maxLength={BOW_TYPE_MAX_LENGTH}
            value={draftBowName}
            onChange={(e) => setDraftBowName(e.target.value)}
            autoFocus
          />
        </OtherModal>
      )}
      {otherOpen === "distance" && (
        <OtherModal
          title={T.game.setup.distanceOther}
          onClose={() => setOtherOpen(null)}
          canSubmit={draftDistance !== null}
          onSubmit={() => {
            if (draftDistance === null) return;
            update({ distanceM: draftDistance });
            setOtherOpen(null);
          }}
        >
          <IntegerField
            label={T.game.setup.distance}
            value={draftDistanceText}
            onChange={setDraftDistanceText}
            min={MIN_DISTANCE_M}
            max={MAX_DISTANCE_M}
            autoFocus
          />
        </OtherModal>
      )}
      {otherOpen === "targetType" && (
        <OtherModal
          title={T.game.setup.targetTypeOther}
          onClose={() => setOtherOpen(null)}
          canSubmit={draftTargetSizeCm !== null}
          onSubmit={() => {
            if (draftTargetSizeCm === null) return;
            update({ targetType: customTargetTypeId(draftTargetSizeCm) });
            setOtherOpen(null);
          }}
        >
          <IntegerField
            label={T.game.setup.targetSize}
            value={draftTargetSizeText}
            onChange={setDraftTargetSizeText}
            min={MIN_TARGET_SIZE_CM}
            max={MAX_TARGET_SIZE_CM}
            autoFocus
          />
        </OtherModal>
      )}
    </>
  );
}
