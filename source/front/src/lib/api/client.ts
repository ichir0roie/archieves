import { fetchAuthSession } from 'aws-amplify/auth';
import { isMockAuth } from '../auth/config';
import { toDateOnly } from '../toDateOnly';
import { getT } from '../text';
import type {
  AdminFeedbackRead,
  AnnouncementRead,
  BowType,
  EndCommentRead,
  EndRead,
  EndScoreSummary,
  FeedbackCreate,
  FeedbackRead,
  FeedbackReply,
  GameComments,
  GameCommentRead,
  GameRead,
  GameScoreSummary,
  ImportResult,
  ImportSource,
  OrganizationCreate,
  OrganizationRead,
  OrganizationSummary,
  PointRead,
  RankingMetric,
  RoundCommentRead,
  RoundRead,
  RoundScoreSummary,
  ScoreStatistics,
  GameKindOptions,
  MeRead,
  UserCreate,
  UserProfile,
  UserRanking,
  UserRead,
  UserUpdate,
} from './schemas';

// ブラウザは API を直に叩かず、同じ origin の route handler(src/app/api/v1)が流す
const API_BASE_URL = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly method: string,
    public readonly url: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Everything needed to show what request failed and how, for on-screen debugging. */
export interface ErrorDetails {
  message: string;
  method?: string;
  url?: string;
  status?: number;
  body?: unknown;
}

export function toErrorDetails(e: unknown): ErrorDetails {
  if (e instanceof ApiError) {
    return {
      message: e.message,
      method: e.method,
      url: e.url,
      status: e.status,
      body: e.responseBody,
    };
  }
  if (e instanceof Error) {
    return { message: e.message };
  }
  return { message: getT().api.failed };
}

/**
 * 期限の切れかけた Cognito のトークンを更新して、クッキーに書き戻させる。
 * route handler はクッキーのトークンを読むだけで更新しないので、送る前にここで更新する。
 */
async function refreshSession(forceRefresh = false): Promise<void> {
  if (isMockAuth()) return;
  try {
    await fetchAuthSession({ forceRefresh });
  } catch {
    // ログインしていなければ route handler が 401 を返す
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const url = `${API_BASE_URL}${path}`;
  const send = () =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  await refreshSession();
  let response = await send();
  // Amplify は期限の 5 秒前まで更新しないので、切れかけのトークンが route handler に着く間に切れて 401 になることがある。
  // 強制的に更新して一度だけ送り直す(ログインしていなければもう一度 401 になる)
  if (response.status === 401 && !isMockAuth()) {
    await refreshSession(true);
    response = await send();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (body && typeof body === 'object' && 'detail' in body && String(body.detail)) ||
      response.statusText;
    throw new ApiError(response.status, message, method, url, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function healthCheck(): Promise<{ status: string }> {
  return request('/health');
}

export function listUsers(params?: { skip?: number; limit?: number }): Promise<UserRead[]> {
  const query = new URLSearchParams();
  if (params?.skip !== undefined) query.set('skip', String(params.skip));
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/users${qs ? `?${qs}` : ''}`);
}

export function getUser(userId: number): Promise<UserRead> {
  return request(`/users/${userId}`);
}

export function createUser(user: UserCreate): Promise<UserRead> {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

/** Finds or creates the signed-in user's row, keyed off their Cognito sub. */
export function ensureCurrentUser(user: UserCreate): Promise<MeRead> {
  return request('/users/me/ensure', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

export function getMyUser(): Promise<MeRead> {
  return request('/users/me');
}

/** Updates a user's basic profile info (name, nickname, birth date, organization, region). */
export function updateUser(userId: number, user: UserUpdate): Promise<UserRead> {
  return request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(user),
  });
}

/** Public profile: basic info plus the user's activity (stats) over the last year. */
export function getUserProfile(sub: string): Promise<UserProfile> {
  return request(`/users/${encodeURIComponent(sub)}/profile`);
}

export function listOrganizations(params?: {
  skip?: number;
  limit?: number;
}): Promise<OrganizationRead[]> {
  const query = new URLSearchParams();
  if (params?.skip !== undefined) query.set('skip', String(params.skip));
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/organizations${qs ? `?${qs}` : ''}`);
}

/** Organizations whose name starts with `q`, for autocomplete-as-you-type. */
export function searchOrganizations(q: string, limit?: number): Promise<OrganizationSummary[]> {
  const query = new URLSearchParams();
  query.set('q', q);
  if (limit !== undefined) query.set('limit', String(limit));
  return request(`/organizations/search?${query.toString()}`);
}

export function createOrganization(organization: OrganizationCreate): Promise<OrganizationRead> {
  return request('/organizations', {
    method: 'POST',
    body: JSON.stringify(organization),
  });
}

/** Looks up an organization by exact name, creating it if none exists yet. */
export function findOrCreateOrganization(
  organization: OrganizationCreate,
): Promise<OrganizationRead> {
  return request('/organizations/find-or-create', {
    method: 'POST',
    body: JSON.stringify(organization),
  });
}

export function getOrganization(organizationId: number): Promise<OrganizationRead> {
  return request(`/organizations/${organizationId}`);
}

export function createGame(
  userId: number,
  recordedAt: Date = new Date(),
  gameSize?: number,
  bowType?: string,
): Promise<GameRead> {
  return request('/games', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      recorded_at: toDateOnly(recordedAt),
      game_size: gameSize,
      bow_type: bowType,
    }),
  });
}

export function getGame(gameId: number): Promise<GameRead> {
  return request(`/games/${gameId}`);
}

/** Soft-deletes a game and, with it, its rounds/ends/points. */
export function deleteGame(gameId: number): Promise<void> {
  return request(`/games/${gameId}`, { method: 'DELETE' });
}

/** 論理削除したゲーム。消した日が新しい順。 */
export function listDeletedGames(userId: number): Promise<GameRead[]> {
  return request(`/trash/games?user_id=${userId}`);
}

/** 論理削除したゲームを、配下のラウンド・エンド・点ごと戻す。 */
export function restoreGame(gameId: number): Promise<GameRead> {
  return request(`/games/${gameId}/restore`, { method: 'POST' });
}

/** Games belonging to a single user, most recently created last. */
export function listGames(userId: number): Promise<GameRead[]> {
  return request(`/games?user_id=${userId}`);
}

/** その年(recorded_at)のゲーム全部。既定の 100 件で切れないよう上限を広げる */
export function listGamesOfYear(userId: number, year: number): Promise<GameRead[]> {
  return request(`/games?user_id=${userId}&year=${year}&limit=10000`);
}

/** その年のゲームごとの合計点・エンド平均・ポイント平均 */
export function listGameScoresOfYear(userId: number, year: number): Promise<GameScoreSummary[]> {
  return request(`/games/scores?user_id=${userId}&year=${year}`);
}

/** ゲームのある年。新しい年が先 */
export function listGameYears(userId: number): Promise<number[]> {
  return request(`/games/years?user_id=${userId}`);
}

/** Rounds within a single game, in creation order. */
export function listRounds(gameId: number): Promise<RoundRead[]> {
  return request(`/games/${gameId}/rounds`);
}

export interface CreateRoundParams {
  number: number;
  endSize: number;
  roundSize?: number;
  distanceM: number;
  targetType: string;
  recordedAt?: Date;
}

export function createRound(gameId: number, params: CreateRoundParams): Promise<RoundRead> {
  return request(`/games/${gameId}/rounds`, {
    method: 'POST',
    body: JSON.stringify({
      number: params.number,
      recorded_at: toDateOnly(params.recordedAt ?? new Date()),
      end_size: params.endSize,
      round_size: params.roundSize,
      distance_m: params.distanceM,
      target_type: params.targetType,
    }),
  });
}

export function deleteRound(roundId: number): Promise<void> {
  return request(`/rounds/${roundId}`, { method: 'DELETE' });
}

/** Ends within a single round, in creation order. */
export function listEnds(roundId: number): Promise<EndRead[]> {
  return request(`/rounds/${roundId}/ends`);
}

export function createEnd(roundId: number, number: number, recordedAt: Date = new Date()): Promise<EndRead> {
  return request(`/rounds/${roundId}/ends`, {
    method: 'POST',
    body: JSON.stringify({ number, recorded_at: toDateOnly(recordedAt) }),
  });
}

export function deleteEnd(endId: number): Promise<void> {
  return request(`/ends/${endId}`, { method: 'DELETE' });
}

/** Points (arrows) within a single end, in creation order. */
export function listPoints(endId: number): Promise<PointRead[]> {
  return request(`/ends/${endId}/points`);
}

export interface CreatePointParams {
  number: number;
  score: number;
  x: number;
  y: number;
  recordedAt?: Date;
}

export function createPoint(endId: number, params: CreatePointParams): Promise<PointRead> {
  return request(`/ends/${endId}/points`, {
    method: 'POST',
    body: JSON.stringify({
      number: params.number,
      score: params.score,
      x: params.x,
      y: params.y,
      recorded_at: toDateOnly(params.recordedAt ?? new Date()),
    }),
  });
}

export function deletePoint(pointId: number): Promise<void> {
  return request(`/points/${pointId}`, { method: 'DELETE' });
}

/**
 * Every comment under one game - its own, its rounds' and its ends' - so a
 * whole score sheet can be annotated from a single request.
 */
export function listGameComments(gameId: number): Promise<GameComments> {
  return request(`/games/${gameId}/comments`);
}

/** Writes the game's comment, replacing the one already there if any. */
export function saveGameComment(gameId: number, body: string): Promise<GameCommentRead> {
  return request(`/games/${gameId}/comment`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

export function deleteGameComment(gameId: number): Promise<void> {
  return request(`/games/${gameId}/comment`, { method: 'DELETE' });
}

/** Writes the round's comment, replacing the one already there if any. */
export function saveRoundComment(roundId: number, body: string): Promise<RoundCommentRead> {
  return request(`/rounds/${roundId}/comment`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

export function deleteRoundComment(roundId: number): Promise<void> {
  return request(`/rounds/${roundId}/comment`, { method: 'DELETE' });
}

/** Writes the end's comment, replacing the one already there if any. */
export function saveEndComment(endId: number, body: string): Promise<EndCommentRead> {
  return request(`/ends/${endId}/comment`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

export function deleteEndComment(endId: number): Promise<void> {
  return request(`/ends/${endId}/comment`, { method: 'DELETE' });
}

/** Optional period/user filters shared by every /statistics endpoint. */
export interface StatisticsQuery {
  /** "yyyy-mm-dd" date; inclusive lower bound on `recorded_at`. */
  start?: string;
  /** "yyyy-mm-dd" date; inclusive upper bound on `recorded_at`. */
  end?: string;
  userId?: number;
  /** ゲームの種別で絞る。/statistics だけが使い、未指定の欄は絞らない */
  bowType?: string;
  distanceM?: number;
  targetType?: string;
  endSize?: number;
  roundSize?: number;
  gameSize?: number;
}

function statisticsQueryString(params?: StatisticsQuery): string {
  const query = new URLSearchParams();
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.userId !== undefined) query.set('user_id', String(params.userId));
  if (params?.bowType) query.set('bow_type', params.bowType);
  if (params?.distanceM !== undefined) query.set('distance_m', String(params.distanceM));
  if (params?.targetType) query.set('target_type', params.targetType);
  if (params?.endSize !== undefined) query.set('end_size', String(params.endSize));
  if (params?.roundSize !== undefined) query.set('round_size', String(params.roundSize));
  if (params?.gameSize !== undefined) query.set('game_size', String(params.gameSize));
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** 統計の絞り込みに選べる種別の値(利用者の記録にあるもの)。 */
export function getGameKindOptions(userId?: number): Promise<GameKindOptions> {
  return request(`/statistics/game-kinds${statisticsQueryString({ userId })}`);
}

/** Per-round score aggregation (total/average of its points). */
export function listRoundScores(params?: StatisticsQuery): Promise<RoundScoreSummary[]> {
  return request(`/statistics/rounds${statisticsQueryString(params)}`);
}

/** Min/max/average/median of round totals within a period. */
export function getRoundScoreStatistics(params?: StatisticsQuery): Promise<ScoreStatistics> {
  return request(`/statistics/rounds/summary${statisticsQueryString(params)}`);
}

/** Per-end score aggregation (total/average of its points). */
export function listEndScores(params?: StatisticsQuery): Promise<EndScoreSummary[]> {
  return request(`/statistics/ends${statisticsQueryString(params)}`);
}

/** Min/max/average/median of end totals within a period. */
export function getEndScoreStatistics(params?: StatisticsQuery): Promise<ScoreStatistics> {
  return request(`/statistics/ends/summary${statisticsQueryString(params)}`);
}

/** Min/max/average/median of individual point (arrow) scores within a period. */
export function getPointScoreStatistics(params?: StatisticsQuery): Promise<ScoreStatistics> {
  return request(`/statistics/points/summary${statisticsQueryString(params)}`);
}

/** Filters for /statistics/ranking: a metric, a period, an event (bow type / distance), an organization and/or a region. */
export interface RankingQuery {
  metric?: RankingMetric;
  start?: string;
  end?: string;
  bowType?: BowType;
  distanceM?: number;
  organizationId?: number;
  regionId?: number;
}

/** 他のアプリのエクスポートファイルを、その種類(source)に合わせて本人の記録として取り込む。 */
export async function importExportFile(source: ImportSource, file: File): Promise<ImportResult> {
  const method = 'POST';
  const url = `${API_BASE_URL}/import`;
  const formData = new FormData();
  formData.append('source', source);
  formData.append('file', file);

  await refreshSession();
  const response = await fetch(url, {
    method,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (body && typeof body === 'object' && 'detail' in body && String(body.detail)) ||
      response.statusText;
    throw new ApiError(response.status, message, method, url, body);
  }

  return (await response.json()) as ImportResult;
}

/** 本人の記録の SQLite のファイル。ファイル名は応答の Content-Disposition から取る。 */
export async function exportRecords(): Promise<{ blob: Blob; filename: string }> {
  const method = 'GET';
  const url = `${API_BASE_URL}/export/records.db`;

  await refreshSession();
  const response = await fetch(url, { method });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (body && typeof body === 'object' && 'detail' in body && String(body.detail)) ||
      response.statusText;
    throw new ApiError(response.status, message, method, url, body);
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'records.db';
  return { blob: await response.blob(), filename };
}

/** Users ranked by the chosen metric (total score by default), high to low. */
export function listUserRanking(params?: RankingQuery): Promise<UserRanking[]> {
  const query = new URLSearchParams();
  if (params?.metric) query.set('metric', params.metric);
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.bowType) query.set('bow_type', params.bowType);
  if (params?.distanceM !== undefined) query.set('distance_m', String(params.distanceM));
  if (params?.organizationId !== undefined) {
    query.set('organization_id', String(params.organizationId));
  }
  if (params?.regionId !== undefined) query.set('region_id', String(params.regionId));
  const qs = query.toString();
  return request(`/statistics/ranking${qs ? `?${qs}` : ''}`);
}

/** 自分が意見箱に送った内容と、その返信。新しい順。 */
export function listFeedbacks(): Promise<FeedbackRead[]> {
  return request('/feedbacks');
}

export function createFeedback(feedback: FeedbackCreate): Promise<FeedbackRead> {
  return request('/feedbacks', {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}

/** 全員の意見と、送った利用者。新しい順。管理者だけが読める(ほかは 403)。 */
export function listAllFeedbacks(): Promise<AdminFeedbackRead[]> {
  return request('/admin/feedbacks');
}

/** 意見に返信を書く(書き直しもこれ)。管理者だけが使える。 */
export function replyToFeedback(feedbackId: number, reply: FeedbackReply): Promise<AdminFeedbackRead> {
  return request(`/admin/feedbacks/${feedbackId}/reply`, {
    method: 'PUT',
    body: JSON.stringify(reply),
  });
}

/** 直近のお知らせ(API が件数を絞る)。新しい順。 */
export function listAnnouncements(): Promise<AnnouncementRead[]> {
  return request('/announcements');
}
