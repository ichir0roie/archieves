import type { RoundSetup } from "@/modules/data/score/scoreConfig";

export type InputMode = "simple" | "touch";

const ROUND_SETUP_KEY = "roundSetup";
const INPUT_MODE_KEY = "inputMode";
const ROUND_IDS_KEY = "roundId";
const GAME_ID_KEY = "gameId";

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
