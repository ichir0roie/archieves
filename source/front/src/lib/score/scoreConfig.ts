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
 * 矢の直径(mm)を、画面に描いた的の直径(px)と的の実寸との比で px に直す。点数はこの値のまま決めるので
 * 丸めない(丸めると、小さな的では矢の太さが倍・半分に変わる)。画面に出すときだけ丸める
 */
export function arrowDiameterPx(
  arrowDiameterMm: number,
  targetSizeCm: number,
  targetDiameterPx: number,
): number {
  return (arrowDiameterMm / (targetSizeCm * 10)) * targetDiameterPx;
}

/**
 * `Point.score` stores the ring an arrow landed in, not the points it is
 * worth: 11 is X (the inner ten, worth 10 - the X count only breaks ties)
 * and 0 is M (a miss). Use scoreToInt() to turn a stored ring into points.
 */
export const X_SCORE = 11;
export const MISS_SCORE = 0;
export const MAX_RING_SCORE = 10;

/** 選べる的。どの的も X と 1〜10 点の帯を持ち(帯の数は X_SCORE)、違うのは大きさだけ */
export interface TargetTypeConfig {
  id: string;
  sizeCm: number;
}

/**
 * World Archery のよく使う大きさ(122cm は屋外のリカーブ、80cm は屋外の短い距離とコンパウンド、
 * 40cm は屋内 18m)。バックエンドの app/core/target_types.py の TARGET_TYPES と揃える(足すときは両方に足す)
 */
export const TARGET_TYPES: TargetTypeConfig[] = [
  {
    id: "122cm",
    sizeCm: 122,
  },
  {
    id: "80cm",
    sizeCm: 80,
  },
  {
    id: "40cm",
    sizeCm: 40,
  },
];

export const DEFAULT_TARGET_TYPE_ID = "122cm";

/** 名前を変えた的(バックエンドの target_types.py の _RENAMED_TARGET_TYPES と揃える) */
const RENAMED_TARGET_TYPES: Readonly<Record<string, string>> = {
  compound: "80cm",
};

/** 名前を変えた的を今の名前にする。それ以外(選べない古い的も)はそのまま返す */
export function currentTargetTypeId(targetTypeId: string): string {
  return RENAMED_TARGET_TYPES[targetTypeId] ?? targetTypeId;
}

/** 前に選んだ的を、今選べる的にする。名前を変えた的は今の名前に、選べなくなった的は既定の的にする */
export function selectableTargetTypeId(targetTypeId: string): string {
  const id = currentTargetTypeId(targetTypeId);
  return isSelectableTargetType(id) ? id : DEFAULT_TARGET_TYPE_ID;
}

/**
 * その他の的の直径(cm)。"<直径>cm" の名前で持ち、大きさは名前から読む(resolveTargetType)。
 * バックエンドの app/core/target_types.py の MIN/MAX_TARGET_SIZE_CM と揃える
 */
export const MIN_TARGET_SIZE_CM = 10;
export const MAX_TARGET_SIZE_CM = 200;

const CUSTOM_SIZE_CM = /^([1-9]\d*)cm$/;

/** その他の的の名前 */
export function customTargetTypeId(sizeCm: number): string {
  return `${sizeCm}cm`;
}

/** その他の的("<直径>cm"。直径は MIN〜MAX_TARGET_SIZE_CM の整数)か。バックエンドの is_custom_target_type と同じ */
export function isCustomTargetType(targetTypeId: string): boolean {
  const match = CUSTOM_SIZE_CM.exec(targetTypeId);
  if (!match) return false;
  const sizeCm = Number(match[1]);
  return sizeCm >= MIN_TARGET_SIZE_CM && sizeCm <= MAX_TARGET_SIZE_CM;
}

/** 設定の画面で選べる的(プリセットか、その他の的)か */
export function isSelectableTargetType(targetTypeId: string): boolean {
  return getTargetType(targetTypeId) !== undefined || isCustomTargetType(targetTypeId);
}

export function getTargetType(targetTypeId: string): TargetTypeConfig | undefined {
  return TARGET_TYPES.find((t) => t.id === targetTypeId);
}

const SIZE_CM_SUFFIX = /^(\d+(?:\.\d+)?)cm$/;

/**
 * 記録を描く・採点するときの的。選べない古い的(以前の "92cm" など)は、名前の "<直径>cm" から
 * 大きさを読む(バックエンドの resolve_target_size_cm と同じ)。読めない名前(取り込んだ "unknown" など)は
 * 既定の的にする
 */
export function resolveTargetType(targetTypeId: string | null | undefined): TargetTypeConfig {
  const id = targetTypeId ?? DEFAULT_TARGET_TYPE_ID;
  const known = getTargetType(id);
  if (known) return known;
  const match = SIZE_CM_SUFFIX.exec(id);
  if (match) return { id, sizeCm: Number(match[1]) };
  return getTargetType(DEFAULT_TARGET_TYPE_ID)!;
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
  /** TARGET_TYPES の id、またはその他の的("<直径>cm") */
  targetType: string;
  endSize: number;
  roundSize: number;
  gameSize: number;
  /** 矢の直径(mm) */
  arrowDiameterMm: number;
  /** インサイドアウト: 矢の円が帯に完全に入らなければ、その帯の点にしない(線にかかれば低い方) */
  allIn: boolean;
}

export const DEFAULT_ROUND_SETUP: RoundSetup = {
  bowType: DEFAULT_BOW_TYPE,
  distanceM: DEFAULT_DISTANCE_M,
  targetType: DEFAULT_TARGET_TYPE_ID,
  endSize: DEFAULT_END_SIZE,
  roundSize: DEFAULT_ROUND_SIZE,
  gameSize: DEFAULT_GAME_SIZE,
  arrowDiameterMm: DEFAULT_ARROW_DIAMETER_MM,
  allIn: false,
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
    typeof setup.allIn === "boolean" &&
    isSelectableTargetType(setup.targetType)
  );
}

/**
 * 記入画面で押しているあいだのズームの倍率と、狙う点の動き(指の動きの 1/aimDivisor)。記録でなく
 * 端末ごとの好みなので RoundSetup とは分けて持つ(storage.ts の loadAimSettings)
 */
export interface AimSettings {
  lensZoom: number;
  aimDivisor: number;
  /** ズームの直径。記入画面の横幅に対する % */
  lensSizePercent: number;
}

export const MIN_LENS_ZOOM = 1;
export const MAX_LENS_ZOOM = 10;
export const MIN_AIM_DIVISOR = 1;
export const MAX_AIM_DIVISOR = 10;
export const MIN_LENS_SIZE_PERCENT = 10;
export const MAX_LENS_SIZE_PERCENT = 90;

/**
 * 幅 390px ほどのスマホを目安に決めた既定値。的の直径はおよそ 340px で、帯 1 つの幅はおよそ 17px。
 * - 大きさ 50%(約 195px): ズームは指の上に出るので、大きいほど的の上半分を覆い、画面の上にもはみ出す
 * - 倍率 4: ズームの中に帯がおよそ 3 つ入る(195 / 4 ≒ 49px)。狙う点の周りの線が見えて、5mm の矢も 122cm の的でおよそ 6px に描ける
 * - 感度 1/3: 押した所のずれ(帯の半分ほど)を指の短い動きで直せて、離すときの指のぶれも 1/3 にできる
 */
export const DEFAULT_AIM_SETTINGS: AimSettings = {
  lensZoom: 4,
  aimDivisor: 3,
  lensSizePercent: 50,
};

export function isValidAimSettings(settings: AimSettings): boolean {
  return (
    isWithin(settings.lensZoom, MIN_LENS_ZOOM, MAX_LENS_ZOOM) &&
    isWithin(settings.aimDivisor, MIN_AIM_DIVISOR, MAX_AIM_DIVISOR) &&
    isWithin(settings.lensSizePercent, MIN_LENS_SIZE_PERCENT, MAX_LENS_SIZE_PERCENT)
  );
}
