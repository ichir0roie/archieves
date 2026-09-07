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
export const DEFAULT_TARGET_SIZE = "122cm";

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
