import type { RoundSetup } from "@/lib/score/scoreConfig";

/**
 * 入力の画面が手元(localStorage)に持つ、ゲームの記録。API の GameSheetWrite と同じ形にして、
 * 保存・終了のときはそのまま PUT /games/sheet に送る。id が null のものはまだ API に無い。
 *
 * キャッシュは、新しいゲームを始めたとき(設定の画面)と、保存したゲームの編集を始めたとき
 * (スコアの画面)に作り直し、終了したときに消す。入力の画面は API を読まずに、ここから開く。
 * 読み書きは lib/storage.ts(loadScoreSheetCache など)。
 */
export interface SheetPoint {
  id: number | null;
  number: number;
  score: number;
  /** 数字だけの入力(NumberPadInput)の矢は位置を持たないので null */
  x: number | null;
  y: number | null;
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
  /** インサイドアウト */
  all_in: boolean;
  /**
   * あとから入力: スコアの一覧で日付を決めて入れたゲーム。
   * ラウンド・エンド・矢の日付は recorded_at に、矢の時刻はその日の 0 時にそろえる
   */
  backfilled: boolean;
  comment: string | null;
  rounds: Array<SheetRound>;
}

export interface ScoreSheetCache {
  version: typeof SCORE_SHEET_CACHE_VERSION;
  /** 入力している利用者(ログインの sub)。キャッシュはこの人のキーに置く(lib/storage.ts) */
  sub: string;
  sheet: Sheet;
  /** 新しいラウンドを開くときの既定(設定の画面で選んだもの)。保存したゲームの編集では null */
  setup: RoundSetup | null;
  /** 今見ているラウンド・エンドの位置 */
  roundIndex: number;
  endIndex: number;
  /** 保存していない変更がある */
  dirty: boolean;
  /** 点だけ入力(数字のボタン)のゲーム。始めるときに決め、途中では変えない */
  numberPad: boolean;
}

/**
 * キャッシュの形のバージョン。欄を足す・置き換えるだけなら上げず、読むところ(storage.ts の
 * loadScoreSheetCache)で古い形を今の形に移す(入力の途中のゲームを失わない)。
 * 移せない変え方をしたときだけ上げる。上げると古いキャッシュは読まず、入力の途中のゲームは失われる。
 */
export const SCORE_SHEET_CACHE_VERSION = 1;
