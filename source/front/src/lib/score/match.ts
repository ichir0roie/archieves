import type { MatchCreate, MatchRead } from "@/lib/api";
import { MATCH_PATH, START_GAME } from "@/lib/destinations";
import type { Texts } from "@/lib/text";
import { toDateOnly } from "@/lib/toDateOnly";
import type { RoundSetup } from "./scoreConfig";

/** 試合の画面で、試合の id を受けるクエリ(?id=)。共有の URL・QR もこれ */
export const MATCH_ID_PARAM = "id";

/** 設定の画面で、参加する試合の id を受けるクエリ(?match=) */
export const SETUP_MATCH_PARAM = "match";

/** ランキングの画面で、試合で絞るクエリ(?match=) */
export const RANKING_MATCH_PARAM = "match";

/**
 * 試合の id(参加のコード)。「開催日-作った人の id-試合の番号-ランダムな 8 字」(API の
 * app/core/match_codes.py)。前に作った試合は 8 字だけのコードなので、英数字をハイフンでつないだもの
 * なら受けて、あるかどうかは API に任せる
 */
const MATCH_ID_PATTERN = /^[0-9A-Z]+(?:-[0-9A-Z]+)*$/;
const MATCH_ID_MIN_LENGTH = 8;
const MATCH_ID_MAX_LENGTH = 64;

/** 試合のタイトル・内容の長さ。API の app/core/matches.py と揃える */
export const MATCH_TITLE_MAX_LENGTH = 100;
export const MATCH_DESCRIPTION_MAX_LENGTH = 2000;

/** 作った人が付けるタイトルと内容。空なら付けない(API が null にする) */
export type MatchInfo = {
  title: string;
  description: string;
};

type MatchSizes = Pick<MatchRead, "end_size" | "round_size" | "game_size">;

/** 設定のうち試合で揃える数(ラウンド数・エンド数・矢数)と、タイトル・内容を、試合を作る要求にする */
export function toMatchCreate(setup: RoundSetup, info: MatchInfo): MatchCreate {
  return {
    title: info.title,
    description: info.description,
    game_size: setup.gameSize,
    round_size: setup.roundSize,
    end_size: setup.endSize,
  };
}

/** 自分で選んだ設定(弓・距離・的など)に、試合で揃える数を重ねる */
export function withMatchSizes(setup: RoundSetup, match: MatchSizes): RoundSetup {
  return {
    ...setup,
    gameSize: match.game_size,
    roundSize: match.round_size,
    endSize: match.end_size,
  };
}

/** 「合計 N本 (6本 × 6エンド × 2ラウンド)」 */
export function matchArrowSummary(T: Texts, match: MatchSizes): string {
  return T.game.setup.summary(
    match.end_size * match.round_size * match.game_size,
    String(match.end_size),
    String(match.round_size),
    String(match.game_size),
  );
}

/** 試合のタイトル。付けていなければ「試合 <コード>」 */
export function matchTitle(T: Texts, match: Pick<MatchRead, "id" | "title">): string {
  return match.title ?? T.match.badge(match.id);
}

/** 試合のゲームの日付("yyyy-mm-dd")。試合の日時の、手元の時間帯での日付にそろえる */
export function matchRecordedAt(match: MatchRead): string {
  return toDateOnly(new Date(match.held_at));
}

/**
 * 打ち込まれた・URL に書かれた試合の id を読む。読めなければ null。
 * 打ち写しの揺れ(小文字・全角・空白)は許す。ハイフンはコードの区切りなので残す
 */
export function parseMatchId(text: string | null): string | null {
  if (text === null) return null;
  const normalized = text
    .normalize("NFKC")
    .replace(/\s/g, "")
    .toUpperCase();
  if (normalized.length < MATCH_ID_MIN_LENGTH || normalized.length > MATCH_ID_MAX_LENGTH) return null;
  return MATCH_ID_PATTERN.test(normalized) ? normalized : null;
}

/**
 * QR から読んだ文字を試合の id にする。参加の URL(?id=<コード>)でも、コードだけでも受ける。
 * URL の場所(どのサーバーか)は見ない。手元・本番のどちらで作った QR でも、コードは同じ試合を指すため
 */
export function matchIdFromQr(text: string): string | null {
  try {
    const url = new URL(text);
    return parseMatchId(url.searchParams.get(MATCH_ID_PARAM));
  } catch {
    return parseMatchId(text);
  }
}

/** 試合の画面(概要・参加・QR・結果)。共有の URL・QR もここを指す */
export function matchPath(matchId: string): string {
  return `${MATCH_PATH}?${MATCH_ID_PARAM}=${matchId}`;
}

/** 試合に参加して、自分の弓・距離などを選ぶ設定の画面 */
export function matchSetupPath(matchId: string): string {
  return `${START_GAME.href}?${SETUP_MATCH_PARAM}=${matchId}`;
}

export function matchRankingPath(matchId: string): string {
  return `/ranking?${RANKING_MATCH_PARAM}=${matchId}`;
}
