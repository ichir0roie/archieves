import { fetchAuthSession } from 'aws-amplify/auth';
import { isMockAuth } from '../auth/config';
import { toDateOnly } from '../toDateOnly';
import { T } from '../text';
import type {
  EndCommentRead,
  EndRead,
  EndScoreSummary,
  GameComments,
  GameCommentRead,
  GameRead,
  ImportResult,
  MatchCreate,
  MatchRead,
  MatchSummary,
  MatchUpdate,
  OrganizationCreate,
  OrganizationRead,
  OrganizationSummary,
  PointRead,
  RoundCommentRead,
  RoundRead,
  RoundScoreSummary,
  ScoreStatistics,
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
  return { message: T.api.failed };
}

/**
 * 期限の切れかけた Cognito のトークンを更新して、クッキーに書き戻させる。
 * route handler はクッキーのトークンを読むだけで更新しないので、送る前にここで更新する。
 */
async function refreshSession(): Promise<void> {
  if (isMockAuth()) return;
  try {
    await fetchAuthSession();
  } catch {
    // ログインしていなければ route handler が 401 を返す
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const url = `${API_BASE_URL}${path}`;
  await refreshSession();
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

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
export function ensureCurrentUser(user: UserCreate): Promise<UserRead> {
  return request('/users/me/ensure', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

export function getMyUser(): Promise<UserRead> {
  return request('/users/me');
}

/** Updates a user's basic profile info (name, nickname, age, organization, region). */
export function updateUser(userId: number, user: UserUpdate): Promise<UserRead> {
  return request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(user),
  });
}

/** Public profile: basic info plus the user's activity (stats + matches) over the last year. */
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
): Promise<GameRead> {
  return request('/games', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      recorded_at: toDateOnly(recordedAt),
      game_size: gameSize,
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

/** Games belonging to a single user, most recently created last. */
export function listGames(userId: number): Promise<GameRead[]> {
  return request(`/games?user_id=${userId}`);
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

/** The match (competition) info attached to a game, if any. */
export function getMatch(gameId: number): Promise<MatchRead> {
  return request(`/games/${gameId}/match`);
}

export function createMatch(gameId: number, match: MatchCreate): Promise<MatchRead> {
  return request(`/games/${gameId}/match`, {
    method: 'POST',
    body: JSON.stringify(match),
  });
}

export function updateMatch(matchId: number, match: MatchUpdate): Promise<MatchRead> {
  return request(`/matches/${matchId}`, {
    method: 'PATCH',
    body: JSON.stringify(match),
  });
}

export function deleteMatch(matchId: number): Promise<void> {
  return request(`/matches/${matchId}`, { method: 'DELETE' });
}

/** Matches joined with their game's date, optionally filtered to a period and/or a user. */
export function listMatches(params?: StatisticsQuery): Promise<MatchSummary[]> {
  return request(`/matches${statisticsQueryString(params)}`);
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
}

function statisticsQueryString(params?: StatisticsQuery): string {
  const query = new URLSearchParams();
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.userId !== undefined) query.set('user_id', String(params.userId));
  const qs = query.toString();
  return qs ? `?${qs}` : '';
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

/** Filters for /statistics/ranking: a period plus an organization and/or a region. */
export interface RankingQuery {
  start?: string;
  end?: string;
  organizationId?: number;
  regionId?: number;
}

/** Imports the legacy client app's local SQLite backup, attributed to the signed-in user. */
export async function importSqliteBackup(file: File): Promise<ImportResult> {
  const method = 'POST';
  const url = `${API_BASE_URL}/import/sqlite-backup`;
  const formData = new FormData();
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

/** Users ranked by their average game score, high to low. */
export function listUserRanking(params?: RankingQuery): Promise<UserRanking[]> {
  const query = new URLSearchParams();
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.organizationId !== undefined) {
    query.set('organization_id', String(params.organizationId));
  }
  if (params?.regionId !== undefined) query.set('region_id', String(params.regionId));
  const qs = query.toString();
  return request(`/statistics/ranking${qs ? `?${qs}` : ''}`);
}
