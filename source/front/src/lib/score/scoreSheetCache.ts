import type { RoundSetup } from "@/lib/score/scoreConfig";

/**
 * 入力の画面が手元(localStorage)に持つ、ゲームの記録。API の GameSheetWrite と同じ形にして、
 * 保存・終了のときはそのまま PUT /games/sheet に送る。id が null のものはまだ API に無い。
 *
 * キャッシュは、新しいゲームを始めたとき(設定の画面)と、保存したゲームの編集を始めたとき
 * (スコアの画面)に作り直し、終了したときに消す。入力の画面は API を読まずに、ここから開く。
 */
export interface SheetPoint {
  id: number | null;
  number: number;
  score: number;
  x: number;
  y: number;
  /** 矢を記録した日(手元の日付)と時刻。保存のときにそのまま送る */
  recorded_at: string;
  shot_at: string | null;
}

export interface SheetEnd {
  id: number | null;
  number: number;
  recorded_at: string;
  comment: string | null;
  points: Array<SheetPoint>;
}

export interface SheetRound {
  id: number | null;
  number: number;
  recorded_at: string;
  end_size: number;
  round_size: number | null;
  distance_m: number;
  target_type: string;
  comment: string | null;
  ends: Array<SheetEnd>;
}

export interface Sheet {
  id: number | null;
  /** 新しいゲームの保存の応答を失って送り直しても、二つ作らないためのキー */
  client_key: string | null;
  recorded_at: string;
  game_size: number | null;
  bow_type: string | null;
  /** 矢の直径(mm)。null は既定の太さ */
  arrow_diameter_mm: number | null;
  /** オールイン。これを足す前のキャッシュには無い(無ければ false) */
  all_in?: boolean;
  comment: string | null;
  rounds: Array<SheetRound>;
}

export interface ScoreSheetCache {
  version: typeof CACHE_VERSION;
  sheet: Sheet;
  /** 新しいラウンドを開くときの既定(設定の画面で選んだもの)。保存したゲームの編集では null */
  setup: RoundSetup | null;
  /** 今見ているラウンド・エンドの位置 */
  roundIndex: number;
  endIndex: number;
  /** 保存していない変更がある */
  dirty: boolean;
}

const CACHE_KEY = "scoreSheet";
// 形を変えたら上げる。古い形のキャッシュは読まない(壊れた記録を画面に出さない)
const CACHE_VERSION = 1;

export function readScoreSheetCache(): ScoreSheetCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as ScoreSheetCache | null;
    if (!parsed || parsed.version !== CACHE_VERSION || !Array.isArray(parsed.sheet?.rounds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeScoreSheetCache(cache: Omit<ScoreSheetCache, "version">) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, version: CACHE_VERSION }));
}

export function clearScoreSheetCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // 消せなくても、次に始めるときに上書きする
  }
}
