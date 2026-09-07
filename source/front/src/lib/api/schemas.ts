/**
 * Request/response contract interfaces mirroring the Pydantic schemas in
 * archieves-api's `app/schemas/`. These are the shapes actually exchanged
 * with the API, as opposed to the full entity shapes in `models.ts`.
 */

export interface UserBase {
  name: string;
  nickname?: string | null;
  age?: number | null;
  organization_id?: number | null;
  region_id?: number | null;
}

export type UserCreate = UserBase;

export interface UserUpdate {
  name?: string | null;
  nickname?: string | null;
  age?: number | null;
  organization_id?: number | null;
  region_id?: number | null;
}

export interface UserRead extends Required<UserBase> {
  id: number;
  sub: string | null;
}

export interface OrganizationBase {
  name: string;
  formal_name?: string | null;
  description?: string | null;
  homepage_url?: string | null;
  location?: string | null;
  parent_organization_id?: number | null;
}

export type OrganizationCreate = OrganizationBase;

export interface OrganizationSummary {
  id: number;
  name: string;
}

export interface OrganizationRead extends Required<OrganizationBase> {
  id: number;
  parent_organization: OrganizationSummary | null;
}

/** Min/max/average/median over a set of scores within a period. */
export interface ScoreStatistics {
  count: number;
  total: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
}

export interface GameBase {
  user_id: number;
  recorded_at: string;
  /** How many rounds were planned for this game on the setup screen. */
  game_size?: number | null;
}

export type GameCreate = GameBase;

export interface GameRead extends GameBase {
  id: number;
}

export interface RoundBase {
  number: number;
  recorded_at: string;
  end_size: number;
  round_size?: number | null;
  distance_m: number;
  /** Target face, e.g. "122cm". */
  target_type: string;
}

export type RoundCreate = RoundBase;

export interface RoundRead extends RoundBase {
  id: number;
  game_id: number;
  user_id: number;
}

export interface EndBase {
  number: number;
  recorded_at: string;
}

export type EndCreate = EndBase;

export interface EndRead extends EndBase {
  id: number;
  round_id: number;
  user_id: number;
}

export interface PointBase {
  number: number;
  score: number;
  x: number;
  y: number;
  recorded_at: string;
}

export type PointCreate = PointBase;

export interface PointRead extends PointBase {
  id: number;
  end_id: number;
  user_id: number;
}

export interface RoundScoreSummary {
  round_id: number;
  game_id: number;
  number: number;
  recorded_at: string;
  arrow_count: number;
  total_score: number;
  average_score: number | null;
}

export interface EndScoreSummary {
  end_id: number;
  round_id: number;
  number: number;
  recorded_at: string;
  arrow_count: number;
  total_score: number;
  average_score: number | null;
}

export interface MatchBase {
  name: string;
  link?: string | null;
}

export type MatchCreate = MatchBase;

export interface MatchUpdate {
  name?: string | null;
  link?: string | null;
}

export interface MatchRead extends Required<MatchBase> {
  id: number;
  game_id: number;
  user_id: number;
}

/** A match joined with its game's date, for recent-activity displays. */
export interface MatchSummary extends Required<MatchBase> {
  id: number;
  game_id: number;
  user_id: number;
  recorded_at: string;
}

/** A user's public profile: basic info plus their activity over a recent period. */
export interface UserProfile {
  user: UserRead;
  period_start: string;
  period_end: string;
  rounds: ScoreStatistics;
  ends: ScoreStatistics;
  points: ScoreStatistics;
  matches: MatchSummary[];
}

/** A user's position in a ranking of average game score, high to low. */
export interface UserRanking {
  rank: number;
  user: UserRead;
  game_count: number;
  average_score: number;
}

/** Row counts imported from a legacy SQLite backup, attributed to the signed-in user. */
export interface ImportResult {
  games: number;
  rounds: number;
  ends: number;
  points: number;
}
