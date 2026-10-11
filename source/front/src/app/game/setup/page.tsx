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
  MAX_ARROW_DIAMETER_PX,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_ROUND_SIZE,
  MIN_ARROW_DIAMETER_PX,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_ROUND_SIZE,
  TARGET_TYPES,
  integerRange,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import { BACKFILL_DATE_PARAM, isBackfillDate } from "@/lib/score/backfill";
import { ScoreManager } from "@/lib/score/scoreManager";
import {
  loadRoundSetup,
  saveRoundSetup,
} from "@/lib/storage";
import { useT } from "@/lib/text";

type CountFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  hint: string;
};

function CountField(props: CountFieldProps) {
  return (
    <Field
      label={props.label}
      hint={props.hint}
    >
      {(id) => (
        <select
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
        >
          {integerRange(props.min, props.max).map((n) => (
            <option
              key={n}
              value={n}
            >
              {n}
            </option>
          ))}
        </select>
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
  const [endSize, setEndSize] = useState(DEFAULT_ROUND_SETUP.endSize);
  const [roundSize, setRoundSize] = useState(DEFAULT_ROUND_SETUP.roundSize);
  const [gameSize, setGameSize] = useState(DEFAULT_ROUND_SETUP.gameSize);
  const [arrowDiameterPx, setArrowDiameterPx] = useState(DEFAULT_ROUND_SETUP.arrowDiameterPx);
  const [allIn, setAllIn] = useState(DEFAULT_ROUND_SETUP.allIn);
  const [otherOpen, setOtherOpen] = useState<"bowType" | "distance" | null>(null);
  const [draftBowName, setDraftBowName] = useState("");
  const [draftDistance, setDraftDistance] = useState(DEFAULT_ROUND_SETUP.distanceM);
  // あとから入力の日付。スコアの一覧から ?date=yyyy-mm-dd で来る。無い・読めない日付なら今の日時で付ける
  const [backfillDate, setBackfillDate] = useState<string | null>(null);

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    const saved = loadRoundSetup();
    if (!saved) return;
    setBowType(saved.bowType);
    setDistance(saved.distanceM);
    setTargetTypeId(saved.targetType);
    setEndSize(saved.endSize);
    setRoundSize(saved.roundSize);
    setGameSize(saved.gameSize);
    setArrowDiameterPx(saved.arrowDiameterPx);
    setAllIn(saved.allIn);
  }, []);

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get(BACKFILL_DATE_PARAM);
    if (isBackfillDate(date)) setBackfillDate(date);
  }, []);

  const bowIsOther = !BOW_TYPES.some((b) => b.id === bowType);
  const distanceIsOther = !DISTANCE_PRESETS_M.includes(distance);
  const trimmedDraftBowName = draftBowName.trim();

  const totalArrows = endSize * roundSize * gameSize;

  function openBowOther() {
    setDraftBowName(bowIsOther ? bowType : "");
    setOtherOpen("bowType");
  }

  function openDistanceOther() {
    setDraftDistance(distance);
    setOtherOpen("distance");
  }

  function start() {
    // 入力の途中のゲームの、保存していない記録はキャッシュにしか無い。始めると捨てるので確かめる
    if (ScoreManager.hasUnsavedCache() && !window.confirm(T.game.setup.discardUnsaved)) return;
    const setup: RoundSetup = {
      bowType,
      distanceM: distance,
      targetType: targetTypeId,
      endSize,
      roundSize,
      gameSize,
      arrowDiameterPx,
      allIn,
    };
    saveRoundSetup(setup);
    // この画面からは必ず新しいゲームを始める(手元のキャッシュを作り直す)。続きはこの画面を通らない
    ScoreManager.startNewGame(setup, backfillDate);
    router.push("/game/score-card");
  }

  return (
    <div className="page">
      <PageHeader title={T.game.setup.title} />
      {backfillDate && (
        <div className="BackfillNotice panel stack tight">
          <b>{T.game.setup.backfill(backfillDate)}</b>
          <span className="muted small">{T.game.setup.backfillHint}</span>
        </div>
      )}
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
        <CountField
          label={T.game.setup.endSize}
          value={endSize}
          onChange={setEndSize}
          min={MIN_END_SIZE}
          max={MAX_END_SIZE}
          hint={T.game.setup.endSizeHint}
        />
        <CountField
          label={T.game.setup.roundSize}
          value={roundSize}
          onChange={setRoundSize}
          min={MIN_ROUND_SIZE}
          max={MAX_ROUND_SIZE}
          hint={T.game.setup.roundSizeHint}
        />
        <CountField
          label={T.game.setup.gameSize}
          value={gameSize}
          onChange={setGameSize}
          min={MIN_GAME_SIZE}
          max={MAX_GAME_SIZE}
          hint={T.game.setup.gameSizeHint}
        />

        <Field
          label={T.game.setup.arrowDiameter}
          hint={T.game.setup.arrowDiameterHint}
        >
          {(id) => (
            <div className="row">
              <select
                id={id}
                className="grow"
                value={arrowDiameterPx}
                onChange={(e) => setArrowDiameterPx(Number(e.target.value))}
              >
                {integerRange(MIN_ARROW_DIAMETER_PX, MAX_ARROW_DIAMETER_PX).map((n) => (
                  <option
                    key={n}
                    value={n}
                  >
                    {n}px
                  </option>
                ))}
              </select>
              {/* 記入画面のズームに出すのと同じ部品・同じ大きさ。帯の線への届き方を設定する前に見られる */}
              <div
                className="SightPreview sight-preview ring-gold"
                role="img"
                aria-label={T.game.setup.sightPreview}
              >
                <ArrowSight
                  arrowDiameterPx={arrowDiameterPx}
                  ringClassName="ring-gold"
                />
              </div>
            </div>
          )}
        </Field>

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

        <p className="SetupSummary game-note muted">
          {T.game.setup.summary(
            totalArrows,
            String(endSize),
            String(roundSize),
            String(gameSize),
          )}
        </p>

        <button
          type="button"
          className="primary large block"
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
