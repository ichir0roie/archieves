import {
  DEFAULT_ROUND_SETUP,
  isValidRoundSetup,
  type RoundSetup,
} from "@/modules/data/score/scoreConfig";

export type InputMode = "simple" | "touch";

const ROUND_SETUP_KEY = "roundSetup";
const INPUT_MODE_KEY = "inputMode";
const GAME_ID_KEY = "gameId";
const NEW_GAME_START_KEY = "newGameStart";

/** The distance/target size/arrows per end/end count/round count chosen on the setup screen. */
export function saveRoundSetup(setup: RoundSetup) {
  localStorage.setItem(ROUND_SETUP_KEY, JSON.stringify(setup));
}

/**
 * Anything stored under this key is user-editable and can predate a change
 * to RoundSetup's shape, so a stored setup that no longer describes a
 * scorable game is treated as absent rather than fed to ScoreManager.
 */
export function loadRoundSetup(): RoundSetup | null {
  const raw = localStorage.getItem(ROUND_SETUP_KEY);
  if (!raw) return null;
  try {
    const setup = { ...DEFAULT_ROUND_SETUP, ...(JSON.parse(raw) as Partial<RoundSetup>) };
    return isValidRoundSetup(setup) ? setup : null;
  } catch {
    return null;
  }
}

/** Which score entry page ("続きから") should resume the active game. */
export function saveInputMode(mode: InputMode) {
  localStorage.setItem(INPUT_MODE_KEY, mode);
}

export function loadInputMode(): InputMode | null {
  const mode = localStorage.getItem(INPUT_MODE_KEY);
  return mode === "simple" || mode === "touch" ? mode : null;
}

export function saveGameId(gameId: string) {
  localStorage.setItem(GAME_ID_KEY, gameId);
}

export function clearGameId() {
  localStorage.removeItem(GAME_ID_KEY);
}

export function loadGameId(): string | null {
  return localStorage.getItem(GAME_ID_KEY);
}

/**
 * Permission for the score entry screen to start a brand-new game. Only
 * /game/setup sets this, right before navigating to score-card/
 * simple-score-card - any other way of landing there (browser back, the
 * score-view Home button, a stale tab) must not silently start a new game.
 * It stays armed across reloads of that still-empty screen (nothing has
 * been saved yet, so there's nothing to distinguish it from a first visit)
 * and is only cleared once the game becomes real - see
 * ScoreManager.ensurePersisted(), which clears it right where it calls
 * saveGameId(). Backing all the way out of a game that never got a score
 * re-arms it, so the same still-empty screen keeps working.
 */
export function markNewGameStart() {
  sessionStorage.setItem(NEW_GAME_START_KEY, "1");
}

export function hasNewGameStart(): boolean {
  return sessionStorage.getItem(NEW_GAME_START_KEY) === "1";
}

export function clearNewGameStart() {
  sessionStorage.removeItem(NEW_GAME_START_KEY);
}
