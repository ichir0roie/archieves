import type { RoundSetup } from "@/modules/data/score/scoreConfig";

export type InputMode = "simple" | "touch";

const ROUND_SETUP_KEY = "roundSetup";
const INPUT_MODE_KEY = "inputMode";
const ROUND_IDS_KEY = "roundId";
const GAME_ID_KEY = "gameId";
const NEW_GAME_START_KEY = "newGameStart";

/** The distance/target size/end count/round count chosen on the setup screen. */
export function saveRoundSetup(setup: RoundSetup) {
  localStorage.setItem(ROUND_SETUP_KEY, JSON.stringify(setup));
}

export function loadRoundSetup(): RoundSetup | null {
  const raw = localStorage.getItem(ROUND_SETUP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoundSetup;
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

export function saveRoundIds(roundIds: string[]) {
  localStorage.setItem(ROUND_IDS_KEY, roundIds.join(","));
}

export function loadRoundIds(): string[] {
  const roundId = localStorage.getItem(ROUND_IDS_KEY);
  return roundId ? roundId.split(",") : [];
}

export function saveGameId(gameId: string) {
  localStorage.setItem(GAME_ID_KEY, gameId);
}

export function clearGameId() {
  localStorage.removeItem(GAME_ID_KEY);
  localStorage.removeItem(ROUND_IDS_KEY);
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
 * saveGameId().
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
