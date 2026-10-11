import type { BowType } from "@/lib/api/schemas";

/**
 * archieves-api's Round carries end_size/round_size/distance_m/target_type
 * per round, and Game carries game_size (planned round count). These are
 * the fallback values ScoreManager uses when a game has none of its own yet
 * (e.g. it predates the setup screen), or when RoundSetup below doesn't
 * specify one.
 *
 * The names follow the score sheet: a game is `game_size` rounds, a round is
 * `round_size` ends, an end is `end_size` arrows.
 */
export const DEFAULT_GAME_SIZE = 2;
export const DEFAULT_ROUND_SIZE = 6;
export const DEFAULT_END_SIZE = 6;
export const DEFAULT_DISTANCE_M = 70;

/**
 * Structural limits, mirrored in the backend's app/core/scoring.py so the
 * setup screen rejects what the API would reject anyway.
 */
export const MIN_GAME_SIZE = 1;
export const MAX_GAME_SIZE = 100;
export const MIN_ROUND_SIZE = 1;
export const MAX_ROUND_SIZE = 100;
export const MIN_END_SIZE = 1;
export const MAX_END_SIZE = 100;
export const MIN_DISTANCE_M = 1;
export const MAX_DISTANCE_M = 100;

/**
 * 矢の直径(mm)。記入画面は arrowDiameterPx で画面の px に直し、その円が少しでも帯の線にかかれば
 * 高い方の点にする。API の app/core/scoring.py の MIN/MAX_ARROW_DIAMETER_MM と揃える
 */
export const DEFAULT_ARROW_DIAMETER_MM = 5;
export const MIN_ARROW_DIAMETER_MM = 1;
export const MAX_ARROW_DIAMETER_MM = 30;

/**
 * 矢の直径(mm)を、画面に描いた的の直径(px)と的の実寸との比で px に直し、四捨五入する。
 * 0px だと矢の印もサイトの円も消えるので、1px より小さくはしない
 */
export function arrowDiameterPx(
  arrowDiameterMm: number,
  targetSizeCm: number,
  targetDiameterPx: number,
): number {
  return Math.max(Math.round((arrowDiameterMm / (targetSizeCm * 10)) * targetDiameterPx), 1);
}

/**
 * `Point.score` stores the ring an arrow landed in, not the points it is
 * worth: 11 is X (the inner ten, worth 10 - the X count only breaks ties)
 * and 0 is M (a miss). Use scoreToInt() to turn a stored ring into points.
 */
export const X_SCORE = 11;
export const MISS_SCORE = 0;
export const MAX_RING_SCORE = 10;

/** A selectable target face: its physical size and how many scoring rings it has. */
export interface TargetTypeConfig {
  id: string;
  sizeCm: number;
  color: string;
  ringCount: number;
}

/**
 * Fixed, hand-maintained list (mirrored in the backend's
 * app/core/target_types.py) so the input screens and the API agree on what
 * target faces exist. Extend both lists together when a new face is added.
 */
export const TARGET_TYPES: TargetTypeConfig[] = [
  {
    id: "92cm",
    sizeCm: 92,
    color: "#FFD700",
    ringCount: 11,
  },
  {
    id: "122cm",
    sizeCm: 122,
    color: "#FFD700",
    ringCount: 11,
  },
  {
    id: "compound",
    sizeCm: 80,
    color: "#0057B8",
    ringCount: 10,
  },
];

export const DEFAULT_TARGET_TYPE_ID = "122cm";

export function getTargetType(targetTypeId: string): TargetTypeConfig | undefined {
  return TARGET_TYPES.find((t) => t.id === targetTypeId);
}

/**
 * The face to score against. Rounds imported from the legacy client carry a
 * target_type outside TARGET_TYPES (e.g. "unknown"), and the input screens
 * still have to draw something, so those fall back to the standard face.
 */
export function resolveTargetType(targetTypeId: string | null | undefined): TargetTypeConfig {
  return (
    getTargetType(targetTypeId ?? DEFAULT_TARGET_TYPE_ID) ??
    getTargetType(DEFAULT_TARGET_TYPE_ID)!
  );
}

/**
 * Highest score the face can produce: an 11-ring face (1-10 plus X) tops out
 * at X, a 10-ring compound face at 10.
 */
export function maxScoreForTargetType(targetTypeId: string | null | undefined): number {
  const { ringCount } = resolveTargetType(targetTypeId);
  return ringCount > MAX_RING_SCORE ? X_SCORE : ringCount;
}

/** 弓の種類。バックエンドの app/core/bow_types.py の BowType と揃える。表示名は text の options.bowType */
export const BOW_TYPES: ReadonlyArray<{ id: BowType }> = [
  { id: "recurve" },
  { id: "compound" },
  { id: "barebow" },
];

/** 設定画面の距離の選択肢と、ランキングの距離の絞り込みで共通 */
export const DISTANCE_PRESETS_M = [18, 30, 50, 60, 70, 90];

export const DEFAULT_BOW_TYPE: BowType = "recurve";

/** 弓の種類を自由入力の名前で持つときの長さ。バックエンドの BOW_TYPE_MAX_LENGTH と揃える */
export const BOW_TYPE_MAX_LENGTH = 20;

/** 1〜100 の整数のプルダウンの選択肢(設定画面の距離) */
export function integerRange(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function isBowType(value: unknown): value is BowType {
  return BOW_TYPES.some((bowType) => bowType.id === value);
}

/**
 * Distance/target size/arrows per end/end count/round count chosen on the
 * pre-recording setup screen (see /game/setup), applied to every round
 * ScoreManager creates for the resulting game.
 */
export interface RoundSetup {
  /** BOW_TYPES の id、またはその他で入力した名前 */
  bowType: string;
  distanceM: number;
  targetType: string;
  endSize: number;
  roundSize: number;
  gameSize: number;
  /** 矢の直径(mm) */
  arrowDiameterMm: number;
}

export const DEFAULT_ROUND_SETUP: RoundSetup = {
  bowType: DEFAULT_BOW_TYPE,
  distanceM: DEFAULT_DISTANCE_M,
  targetType: DEFAULT_TARGET_TYPE_ID,
  endSize: DEFAULT_END_SIZE,
  roundSize: DEFAULT_ROUND_SIZE,
  gameSize: DEFAULT_GAME_SIZE,
  arrowDiameterMm: DEFAULT_ARROW_DIAMETER_MM,
};

function isBowName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= BOW_TYPE_MAX_LENGTH;
}

function isWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Whether a setup describes a game that can actually be scored. */
export function isValidRoundSetup(setup: RoundSetup): boolean {
  return (
    isBowName(setup.bowType) &&
    isWithin(setup.distanceM, MIN_DISTANCE_M, MAX_DISTANCE_M) &&
    isWithin(setup.endSize, MIN_END_SIZE, MAX_END_SIZE) &&
    isWithin(setup.roundSize, MIN_ROUND_SIZE, MAX_ROUND_SIZE) &&
    isWithin(setup.gameSize, MIN_GAME_SIZE, MAX_GAME_SIZE) &&
    isWithin(setup.arrowDiameterMm, MIN_ARROW_DIAMETER_MM, MAX_ARROW_DIAMETER_MM) &&
    getTargetType(setup.targetType) !== undefined
  );
}
