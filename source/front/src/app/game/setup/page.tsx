"use client";

import ArrowSight from "@/components/ArrowSight";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import Segment from "@/components/Segment";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BOW_TYPES,
  BOW_TYPE_MAX_LENGTH,
  DEFAULT_ROUND_SETUP,
  DISTANCE_PRESETS_M,
  MAX_ARROW_DIAMETER_MM,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_ROUND_SIZE,
  MIN_ARROW_DIAMETER_MM,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_ROUND_SIZE,
  TARGET_TYPES,
  arrowDiameterPx,
  integerRange,
  resolveTargetType,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import { ScoreManager } from "@/lib/score/scoreManager";
import {
  loadRoundSetup,
  loadTargetDiameterPx,
  saveRoundSetup,
} from "@/lib/storage";
import { useT } from "@/lib/text";

/** 的の周りの余白(TargetCircleInput の PADDING の 2 倍)。記入画面を開く前の的の大きさの見積もりに使う */
const TARGET_FACE_PADDING_PX = 48;

/** 入力の文字を、min〜max の整数に読む。読めなければ null。全角の数字も受ける(日本語入力のまま打つため) */
function parseInteger(text: string, min: number, max: number): number | null {
  const normalized = text
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= min && value <= max ? value : null;
}

type IntegerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  hint: string;
  /** 欄の右に並べるもの(矢の直径のサイトの見本) */
  aside?: ReactNode;
};

function IntegerField(props: IntegerFieldProps) {
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
          />
          {props.aside}
        </div>
      )}
    </Field>
  );
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

export default function Page() {
  const T = useT();
  const router = useRouter();
  const BOW_OPTIONS = BOW_TYPES.map((bowType) => ({
    value: bowType.id,
    label: T.options.bowType[bowType.id],
  }));
  const TARGET_OPTIONS = TARGET_TYPES.map((targetType) => ({
    value: targetType.id,
    label: T.options.targetType[targetType.id],
  }));

  const [bowType, setBowType] = useState<string>(DEFAULT_ROUND_SETUP.bowType);
  const [distance, setDistance] = useState(DEFAULT_ROUND_SETUP.distanceM);
  const [targetTypeId, setTargetTypeId] = useState(DEFAULT_ROUND_SETUP.targetType);
  // 数は文字のまま持ち、読めない間は開始させない(打ちかけの空や範囲外も、そのまま見せて直させる)
  const [endSizeText, setEndSizeText] = useState(String(DEFAULT_ROUND_SETUP.endSize));
  const [roundSizeText, setRoundSizeText] = useState(String(DEFAULT_ROUND_SETUP.roundSize));
  const [gameSizeText, setGameSizeText] = useState(String(DEFAULT_ROUND_SETUP.gameSize));
  const [arrowDiameterMmText, setArrowDiameterMmText] = useState(
    String(DEFAULT_ROUND_SETUP.arrowDiameterMm),
  );
  const [targetDiameterPx, setTargetDiameterPx] = useState<number | null>(null);
  const [allIn, setAllIn] = useState(DEFAULT_ROUND_SETUP.allIn);
  const [otherOpen, setOtherOpen] = useState<"bowType" | "distance" | null>(null);
  const [draftBowName, setDraftBowName] = useState("");
  const [draftDistance, setDraftDistance] = useState(DEFAULT_ROUND_SETUP.distanceM);

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    // 記入画面を一度も開いていなければ、的は画面の幅か高さいっぱいに描かれるものとして見積もる
    setTargetDiameterPx(
      loadTargetDiameterPx() ??
        Math.min(window.innerWidth, window.innerHeight) - TARGET_FACE_PADDING_PX,
    );
    const saved = loadRoundSetup();
    if (!saved) return;
    setBowType(saved.bowType);
    setDistance(saved.distanceM);
    setTargetTypeId(saved.targetType);
    setEndSizeText(String(saved.endSize));
    setRoundSizeText(String(saved.roundSize));
    setGameSizeText(String(saved.gameSize));
    setArrowDiameterMmText(String(saved.arrowDiameterMm));
    setAllIn(saved.allIn);
  }, []);

  const bowIsOther = !BOW_TYPES.some((b) => b.id === bowType);
  const distanceIsOther = !DISTANCE_PRESETS_M.includes(distance);
  const trimmedDraftBowName = draftBowName.trim();

  const endSize = parseInteger(endSizeText, MIN_END_SIZE, MAX_END_SIZE);
  const roundSize = parseInteger(roundSizeText, MIN_ROUND_SIZE, MAX_ROUND_SIZE);
  const gameSize = parseInteger(gameSizeText, MIN_GAME_SIZE, MAX_GAME_SIZE);
  const arrowDiameterMm = parseInteger(
    arrowDiameterMmText,
    MIN_ARROW_DIAMETER_MM,
    MAX_ARROW_DIAMETER_MM,
  );
  const previewArrowPx =
    arrowDiameterMm !== null && targetDiameterPx !== null
      ? arrowDiameterPx(arrowDiameterMm, resolveTargetType(targetTypeId).sizeCm, targetDiameterPx)
      : null;

  function openBowOther() {
    setDraftBowName(bowIsOther ? bowType : "");
    setOtherOpen("bowType");
  }

  function openDistanceOther() {
    setDraftDistance(distance);
    setOtherOpen("distance");
  }

  function start() {
    if (endSize === null || roundSize === null || gameSize === null || arrowDiameterMm === null) {
      return;
    }
    // 入力の途中のゲームの、保存していない記録はキャッシュにしか無い。始めると捨てるので確かめる
    if (ScoreManager.hasUnsavedCache() && !window.confirm(T.game.setup.discardUnsaved)) return;
    const setup: RoundSetup = {
      bowType,
      distanceM: distance,
      targetType: targetTypeId,
      endSize,
      roundSize,
      gameSize,
      arrowDiameterMm,
      allIn,
    };
    saveRoundSetup(setup);
    // この画面からは必ず新しいゲームを始める(手元のキャッシュを作り直す)。続きはこの画面を通らない
    ScoreManager.startNewGame(setup);
    router.push("/game/score-card");
  }

  return (
    <div className="page">
      <PageHeader title={T.game.setup.title} />
      <div className="panel stack">
        <div className="field">
          <span className="field-label">{T.game.setup.bowType}</span>
          <Segment
            options={BOW_OPTIONS}
            value={bowIsOther ? "" : bowType}
            onChange={setBowType}
            label={T.game.setup.bowType}
            other={{
              label: bowIsOther ? T.game.setup.otherValue(bowType) : T.game.setup.other,
              on: bowIsOther,
              onClick: openBowOther,
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">{T.game.setup.distance}</span>
          <Segment
            options={DISTANCE_OPTIONS}
            value={distanceIsOther ? "" : String(distance)}
            onChange={(value) => setDistance(Number(value))}
            label={T.game.setup.distance}
            other={{
              label: distanceIsOther ? T.game.setup.otherValue(`${distance}m`) : T.game.setup.other,
              on: distanceIsOther,
              onClick: openDistanceOther,
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">{T.game.setup.targetType}</span>
          <Segment
            options={TARGET_OPTIONS}
            value={targetTypeId}
            onChange={setTargetTypeId}
            label={T.game.setup.targetType}
          />
        </div>
        <IntegerField
          label={T.game.setup.endSize}
          value={endSizeText}
          onChange={setEndSizeText}
          min={MIN_END_SIZE}
          max={MAX_END_SIZE}
          hint={T.game.setup.endSizeHint}
        />
        <IntegerField
          label={T.game.setup.roundSize}
          value={roundSizeText}
          onChange={setRoundSizeText}
          min={MIN_ROUND_SIZE}
          max={MAX_ROUND_SIZE}
          hint={T.game.setup.roundSizeHint}
        />
        <IntegerField
          label={T.game.setup.gameSize}
          value={gameSizeText}
          onChange={setGameSizeText}
          min={MIN_GAME_SIZE}
          max={MAX_GAME_SIZE}
          hint={T.game.setup.gameSizeHint}
        />
        <IntegerField
          label={T.game.setup.arrowDiameter}
          value={arrowDiameterMmText}
          onChange={setArrowDiameterMmText}
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
              checked={allIn}
              onChange={(e) => setAllIn(e.target.checked)}
            />
            {T.game.setup.allIn}
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

        <button
          type="button"
          className="primary large block"
          disabled={
            endSize === null || roundSize === null || gameSize === null || arrowDiameterMm === null
          }
          onClick={start}
        >
          {T.game.setup.start}
        </button>
      </div>
      {otherOpen === "bowType" && (
        <OtherModal
          title={T.game.setup.bowTypeOther}
          onClose={() => setOtherOpen(null)}
          canSubmit={trimmedDraftBowName !== ""}
          onSubmit={() => {
            setBowType(trimmedDraftBowName);
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
          canSubmit
          onSubmit={() => {
            setDistance(draftDistance);
            setOtherOpen(null);
          }}
        >
          <select
            aria-label={T.game.setup.distance}
            value={draftDistance}
            onChange={(e) => setDraftDistance(Number(e.target.value))}
          >
            {integerRange(MIN_DISTANCE_M, MAX_DISTANCE_M).map((n) => (
              <option
                key={n}
                value={n}
              >
                {n}m
              </option>
            ))}
          </select>
        </OtherModal>
      )}
      <BackButton />
    </div>
  );
}
