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
export const MAX_GAME_SIZE = 12;
export const MIN_ROUND_SIZE = 1;
export const MAX_ROUND_SIZE = 30;
export const MIN_END_SIZE = 1;
export const MAX_END_SIZE = 12;
export const MIN_DISTANCE_M = 1;
export const MAX_DISTANCE_M = 200;

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
  label: string;
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
    label: "92cm",
    sizeCm: 92,
    color: "#FFD700",
    ringCount: 11,
  },
  {
    id: "122cm",
    label: "122cm(標準)",
    sizeCm: 122,
    color: "#FFD700",
    ringCount: 11,
  },
  {
    id: "compound",
    label: "コンパウンド用(80cm)",
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

/**
 * Distance/target size/arrows per end/end count/round count chosen on the
 * pre-recording setup screen (see /game/setup), applied to every round
 * ScoreManager creates for the resulting game.
 */
export interface RoundSetup {
  distanceM: number;
  targetType: string;
  endSize: number;
  roundSize: number;
  gameSize: number;
}

export const DEFAULT_ROUND_SETUP: RoundSetup = {
  distanceM: DEFAULT_DISTANCE_M,
  targetType: DEFAULT_TARGET_TYPE_ID,
  endSize: DEFAULT_END_SIZE,
  roundSize: DEFAULT_ROUND_SIZE,
  gameSize: DEFAULT_GAME_SIZE,
};

function isWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Whether a setup describes a game that can actually be scored. */
export function isValidRoundSetup(setup: RoundSetup): boolean {
  return (
    isWithin(setup.distanceM, MIN_DISTANCE_M, MAX_DISTANCE_M) &&
    isWithin(setup.endSize, MIN_END_SIZE, MAX_END_SIZE) &&
    isWithin(setup.roundSize, MIN_ROUND_SIZE, MAX_ROUND_SIZE) &&
    isWithin(setup.gameSize, MIN_GAME_SIZE, MAX_GAME_SIZE) &&
    getTargetType(setup.targetType) !== undefined
  );
}
