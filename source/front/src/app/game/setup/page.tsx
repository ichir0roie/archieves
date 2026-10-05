"use client";

import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import Segment from "@/components/Segment";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DEFAULT_ROUND_SETUP,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_ROUND_SIZE,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_ROUND_SIZE,
  TARGET_TYPES,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import {
  clearGameId,
  loadRoundSetup,
  markNewGameStart,
  saveInputMode,
  saveRoundSetup,
  type InputMode,
} from "@/lib/storage";
import { T } from "@/lib/text";

type CountFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  hint: string;
};

/** 数でなく文字のまま持つ。空にした欄が 0 になり、エンドの無いゲームが始まらないようにする */
function CountField(props: CountFieldProps) {
  const invalid = !isCount(props.value, props.min, props.max);

  return (
    <Field
      label={props.label}
      hint={props.hint}
      error={invalid ? T.game.setup.outOfRange(props.min, props.max) : null}
    >
      {(id) => (
        <input
          id={id}
          type="number"
          value={props.value}
          min={props.min}
          max={props.max}
          step={1}
          aria-invalid={invalid}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function isCount(raw: string, min: number, max: number): boolean {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
}

const TARGET_OPTIONS = TARGET_TYPES.map((targetType) => ({
  value: targetType.id,
  label: targetType.label,
}));

export default function Page() {
  const router = useRouter();

  const [distance, setDistance] = useState(String(DEFAULT_ROUND_SETUP.distanceM));
  const [targetTypeId, setTargetTypeId] = useState(DEFAULT_ROUND_SETUP.targetType);
  const [endSize, setEndSize] = useState(String(DEFAULT_ROUND_SETUP.endSize));
  const [roundSize, setRoundSize] = useState(String(DEFAULT_ROUND_SETUP.roundSize));
  const [gameSize, setGameSize] = useState(String(DEFAULT_ROUND_SETUP.gameSize));

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    const saved = loadRoundSetup();
    if (!saved) return;
    setDistance(String(saved.distanceM));
    setTargetTypeId(saved.targetType);
    setEndSize(String(saved.endSize));
    setRoundSize(String(saved.roundSize));
    setGameSize(String(saved.gameSize));
  }, []);

  const isValid =
    isCount(distance, MIN_DISTANCE_M, MAX_DISTANCE_M) &&
    isCount(endSize, MIN_END_SIZE, MAX_END_SIZE) &&
    isCount(roundSize, MIN_ROUND_SIZE, MAX_ROUND_SIZE) &&
    isCount(gameSize, MIN_GAME_SIZE, MAX_GAME_SIZE);

  const totalArrows = Number(endSize) * Number(roundSize) * Number(gameSize);

  function start(mode: InputMode) {
    if (!isValid) return;
    const setup: RoundSetup = {
      distanceM: Number(distance),
      targetType: targetTypeId,
      endSize: Number(endSize),
      roundSize: Number(roundSize),
      gameSize: Number(gameSize),
    };
    saveRoundSetup(setup);
    saveInputMode(mode);
    // この画面からは必ず新しいゲームを始める。「続きから」はこの画面を通らない
    clearGameId();
    markNewGameStart();
    router.push(mode === "simple" ? "/game/simple-score-card" : "/game/score-card");
  }

  return (
    <div className="page">
      <PageHeader title={T.game.setup.title} />
      <div className="panel stack">
        <CountField
          label={T.game.setup.distance}
          value={distance}
          onChange={setDistance}
          min={MIN_DISTANCE_M}
          max={MAX_DISTANCE_M}
          hint={T.game.setup.distanceHint}
        />
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

        {isValid && (
          <p className="SetupSummary game-note muted">
            {T.game.setup.summary(
              totalArrows,
              endSize,
              roundSize,
              gameSize,
            )}
          </p>
        )}

        <div className="stack tight">
          <button
            type="button"
            className="primary large block"
            disabled={!isValid}
            onClick={() => start("simple")}
          >
            {T.game.setup.simpleMode}
          </button>
          <button
            type="button"
            className="large block"
            disabled={!isValid}
            onClick={() => start("touch")}
          >
            {T.game.setup.touchMode}
          </button>
        </div>
      </div>
    </div>
  );
}
