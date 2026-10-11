"use client";

import ArrowSight from "@/components/ArrowSight";
import { TARGET_FACE_PADDING } from "@/components/TargetCircleInput";
import IntegerField, { parseInteger } from "@/components/IntegerField";
import Modal from "@/components/Modal";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import Segment from "@/components/Segment";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BOW_TYPES,
  BOW_TYPE_MAX_LENGTH,
  DEFAULT_ROUND_SETUP,
  DISTANCE_PRESETS_M,
  DEFAULT_AIM_SETTINGS,
  MAX_AIM_DIVISOR,
  MAX_ARROW_DIAMETER_MM,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_LENS_SIZE_PERCENT,
  MAX_LENS_ZOOM,
  MAX_ROUND_SIZE,
  MAX_TARGET_SIZE_CM,
  MIN_AIM_DIVISOR,
  MIN_ARROW_DIAMETER_MM,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_LENS_SIZE_PERCENT,
  MIN_LENS_ZOOM,
  MIN_ROUND_SIZE,
  MIN_TARGET_SIZE_CM,
  TARGET_TYPES,
  arrowDiameterPx,
  customTargetTypeId,
  getTargetType,
  resolveTargetType,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import { BACKFILL_DATE_PARAM, isBackfillDate } from "@/lib/score/backfill";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH } from "@/lib/destinations";
import { ScoreManager } from "@/lib/score/scoreManager";
import {
  loadAimSettings,
  loadRoundSetup,
  loadTargetDiameterPx,
  saveAimSettings,
  saveRoundSetup,
} from "@/lib/storage";
import { useT } from "@/lib/text";

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
  const [lensZoomText, setLensZoomText] = useState(String(DEFAULT_AIM_SETTINGS.lensZoom));
  const [aimDivisorText, setAimDivisorText] = useState(String(DEFAULT_AIM_SETTINGS.aimDivisor));
  const [lensSizePercentText, setLensSizePercentText] = useState(
    String(DEFAULT_AIM_SETTINGS.lensSizePercent),
  );
  const [targetDiameterPx, setTargetDiameterPx] = useState<number | null>(null);
  const [allIn, setAllIn] = useState(DEFAULT_ROUND_SETUP.allIn);
  const [otherOpen, setOtherOpen] = useState<"bowType" | "distance" | "targetType" | null>(null);
  const [draftBowName, setDraftBowName] = useState("");
  const [draftDistanceText, setDraftDistanceText] = useState("");
  const [draftTargetSizeText, setDraftTargetSizeText] = useState("");
  // あとから入力の日付。スコアの一覧から ?date=yyyy-mm-dd で来る。無い・読めない日付なら今の日時で付ける
  const [backfillDate, setBackfillDate] = useState<string | null>(null);

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    // 記入画面を一度も開いていなければ、的は画面の幅か高さいっぱいに描かれるものとして見積もる
    setTargetDiameterPx(
      loadTargetDiameterPx() ??
        Math.min(window.innerWidth, window.innerHeight) - TARGET_FACE_PADDING * 2,
    );
    const aimSettings = loadAimSettings();
    setLensZoomText(String(aimSettings.lensZoom));
    setAimDivisorText(String(aimSettings.aimDivisor));
    setLensSizePercentText(String(aimSettings.lensSizePercent));
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

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get(BACKFILL_DATE_PARAM);
    if (isBackfillDate(date)) setBackfillDate(date);
  }, []);

  const bowIsOther = !BOW_TYPES.some((b) => b.id === bowType);
  const distanceIsOther = !DISTANCE_PRESETS_M.includes(distance);
  const targetIsOther = getTargetType(targetTypeId) === undefined;
  const trimmedDraftBowName = draftBowName.trim();
  const draftDistance = parseInteger(draftDistanceText, MIN_DISTANCE_M, MAX_DISTANCE_M);
  const draftTargetSizeCm = parseInteger(
    draftTargetSizeText,
    MIN_TARGET_SIZE_CM,
    MAX_TARGET_SIZE_CM,
  );

  const endSize = parseInteger(endSizeText, MIN_END_SIZE, MAX_END_SIZE);
  const roundSize = parseInteger(roundSizeText, MIN_ROUND_SIZE, MAX_ROUND_SIZE);
  const gameSize = parseInteger(gameSizeText, MIN_GAME_SIZE, MAX_GAME_SIZE);
  const arrowDiameterMm = parseInteger(
    arrowDiameterMmText,
    MIN_ARROW_DIAMETER_MM,
    MAX_ARROW_DIAMETER_MM,
  );
  const lensZoom = parseInteger(lensZoomText, MIN_LENS_ZOOM, MAX_LENS_ZOOM);
  const aimDivisor = parseInteger(aimDivisorText, MIN_AIM_DIVISOR, MAX_AIM_DIVISOR);
  const lensSizePercent = parseInteger(
    lensSizePercentText,
    MIN_LENS_SIZE_PERCENT,
    MAX_LENS_SIZE_PERCENT,
  );
  const aimSettings =
    lensZoom !== null && aimDivisor !== null && lensSizePercent !== null
      ? {
          lensZoom,
          aimDivisor,
          lensSizePercent,
        }
      : null;
  // 読めない欄があれば null。開始もここで止める
  const sizes =
    endSize !== null && roundSize !== null && gameSize !== null && arrowDiameterMm !== null
      ? {
          endSize,
          roundSize,
          gameSize,
          arrowDiameterMm,
        }
      : null;
  // 開始は sub を引いてから進むので、二度押しで二つ始めないようにする
  const starting = useRef(false);
  const previewArrowPx =
    arrowDiameterMm !== null && targetDiameterPx !== null
      ? arrowDiameterPx(arrowDiameterMm, resolveTargetType(targetTypeId).sizeCm, targetDiameterPx)
      : null;

  function openBowOther() {
    setDraftBowName(bowIsOther ? bowType : "");
    setOtherOpen("bowType");
  }

  function openDistanceOther() {
    setDraftDistanceText(distanceIsOther ? String(distance) : "");
    setOtherOpen("distance");
  }

  function openTargetOther() {
    setDraftTargetSizeText(targetIsOther ? String(resolveTargetType(targetTypeId).sizeCm) : "");
    setOtherOpen("targetType");
  }

  async function start() {
    if (sizes === null || aimSettings === null || starting.current) return;
    starting.current = true;
    try {
      const { userId } = await getCurrentUser();
      // 入力の途中のゲームの、保存していない記録はキャッシュにしか無い。始めると捨てるので確かめる
      if (ScoreManager.hasUnsavedCache(userId) && !window.confirm(T.game.setup.discardUnsaved)) {
        return;
      }
      const setup: RoundSetup = {
        bowType,
        distanceM: distance,
        targetType: targetTypeId,
        ...sizes,
        allIn,
      };
      saveRoundSetup(setup);
      saveAimSettings(aimSettings);
      // この画面からは必ず新しいゲームを始める(手元のキャッシュを作り直す)。続きはこの画面を通らない
      ScoreManager.startNewGame(userId, setup, backfillDate);
      router.push(SCORE_CARD_PATH);
    } finally {
      starting.current = false;
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.game.setup.title} />
      {backfillDate && (
        <div className="BackfillNotice panel stack tight">
          <b>{T.game.setup.backfill(backfillDate)}</b>
          <span className="muted small">{T.game.backfillHint}</span>
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
            value={targetIsOther ? "" : targetTypeId}
            onChange={setTargetTypeId}
            label={T.game.setup.targetType}
            other={{
              label: targetIsOther ? T.game.setup.otherValue(targetTypeId) : T.game.setup.other,
              on: targetIsOther,
              onClick: openTargetOther,
            }}
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
                  zoom={lensZoom ?? DEFAULT_AIM_SETTINGS.lensZoom}
                  ringClassName="ring-gold"
                />
              )}
            </div>
          }
        />
        <IntegerField
          label={T.game.setup.lensZoom}
          value={lensZoomText}
          onChange={setLensZoomText}
          min={MIN_LENS_ZOOM}
          max={MAX_LENS_ZOOM}
          hint={T.game.setup.lensZoomHint}
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

        <div className="field">
          <label className="AllInField check-field">
            <input
              type="checkbox"
              checked={allIn}
              onChange={(e) => setAllIn(e.target.checked)}
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

      </div>
      {/* 設定の欄が長いので、開始はどこまで送っても押せるよう画面の下に留める */}
      <div className="SetupStart setup-start">
        <button
          type="button"
          className="primary large block"
          disabled={sizes === null || aimSettings === null}
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
          canSubmit={draftDistance !== null}
          onSubmit={() => {
            if (draftDistance === null) return;
            setDistance(draftDistance);
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
            setTargetTypeId(customTargetTypeId(draftTargetSizeCm));
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
      <BackButton />
    </div>
  );
}
