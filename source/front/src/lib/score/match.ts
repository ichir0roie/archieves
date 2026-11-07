import type { MatchCreate, MatchRead } from "@/lib/api";
import { MATCH_PATH, MATCH_RESULT_PATH, START_GAME } from "@/lib/destinations";
import { toDateOnly } from "@/lib/toDateOnly";
import type { RoundSetup } from "./scoreConfig";

/** 試合の画面・結果の画面で、試合の id を受けるクエリ(?id=)。共有の URL にも使う */
export const MATCH_ID_PARAM = "id";

/** 設定の画面で、参加する試合の id を受けるクエリ(?match=) */
export const SETUP_MATCH_PARAM = "match";

/**
 * 試合の id(参加のコード)の字と長さ。API の app/core/match_codes.py と揃える。
 * 見分けにくい字(0/O・1/I/L)は使わない
 */
const MATCH_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const MATCH_ID_LENGTH = 8;

/** 設定の画面で決めた設定のうち、試合で揃える数(ラウンド数・エンド数・矢数)を、試合を作る要求にする */
export function toMatchCreate(setup: RoundSetup): MatchCreate {
  return {
    game_size: setup.gameSize,
    round_size: setup.roundSize,
    end_size: setup.endSize,
  };
}

/** 自分で選んだ設定(弓・距離・的など)に、試合で揃える数を重ねる */
export function withMatchSizes(setup: RoundSetup, match: MatchRead): RoundSetup {
  return {
    ...setup,
    gameSize: match.game_size,
    roundSize: match.round_size,
    endSize: match.end_size,
  };
}

/** 試合のゲームの日付("yyyy-mm-dd")。試合の日時の、手元の時間帯での日付にそろえる */
export function matchRecordedAt(match: MatchRead): string {
  return toDateOnly(new Date(match.held_at));
}

/**
 * 打ち込まれた・URL に書かれた試合の id を読む。読めなければ null。
 * 打ち写しの揺れ(小文字・全角・空白やハイフンの区切り)は許す
 */
export function parseMatchId(text: string | null): string | null {
  if (text === null) return null;
  const normalized = text
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (normalized.length !== MATCH_ID_LENGTH) return null;
  return [...normalized].every((c) => MATCH_ID_ALPHABET.includes(c)) ? normalized : null;
}

export function matchJoinPath(matchId: string): string {
  return `${MATCH_PATH}?${MATCH_ID_PARAM}=${matchId}`;
}

export function matchSetupPath(matchId: string): string {
  return `${START_GAME.href}?${SETUP_MATCH_PARAM}=${matchId}`;
}

/** ランキングの画面で、試合で絞るクエリ(?match=) */
export const RANKING_MATCH_PARAM = "match";

export function matchRankingPath(matchId: string): string {
  return `/ranking?${RANKING_MATCH_PARAM}=${matchId}`;
}

export function matchResultPath(matchId: string): string {
  return `${MATCH_RESULT_PATH}?${MATCH_ID_PARAM}=${matchId}`;
}
