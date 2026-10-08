import {
  DEFAULT_ROUND_SETUP,
  isValidRoundSetup,
  type RoundSetup,
} from "@/lib/score/scoreConfig";

const ROUND_SETUP_KEY = "roundSetup";
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
 * /game/setup sets this, right before navigating to score-card - any other
 * way of landing there (browser back, the score-view Home button, a stale
 * tab) must not silently start a new game.
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

const SCORE_LOG_COLLAPSED_KEY = "scoreLogCollapsed";

/** スコアで閉じている見出しのキー(年・月・日)。localStorage が使えなければ全部開いた扱い */
export function loadScoreLogCollapsed(): Array<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SCORE_LOG_COLLAPSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function saveScoreLogCollapsed(keys: Array<string>) {
  try {
    localStorage.setItem(SCORE_LOG_COLLAPSED_KEY, JSON.stringify(keys));
  } catch {
    // 保存できなくても、開閉そのものは画面の中で動く
  }
}
