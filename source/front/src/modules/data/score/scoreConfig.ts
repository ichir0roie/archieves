/**
 * archieves-api's Round carries end_size/round_size/distance_m/target_type
 * per round, and Game carries game_size (planned round count). These are
 * the fallback values ScoreManager uses when a game has none of its own yet
 * (e.g. it predates the setup screen), or when RoundSetup below doesn't
 * specify one.
 */
export const MAX_ROUNDS = 2;
export const DEFAULT_ROUND_SIZE = 6;
export const DEFAULT_END_SIZE = 6;
export const DEFAULT_DISTANCE_M = 70;

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
 * Distance/target size/end count/round count chosen on the pre-recording
 * setup screen (see /game/setup), applied to every round ScoreManager
 * creates for the resulting game.
 */
export interface RoundSetup {
  distanceM: number;
  targetType: string;
  roundSize: number;
  gameSize: number;
}
