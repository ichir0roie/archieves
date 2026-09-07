/**
 * Domain model interfaces mirroring the SQLAlchemy models in
 * archieves-api's `app/models/`. These describe the underlying entities;
 * see `schemas.ts` for the shapes actually exchanged over the wire today.
 */

/** Common columns shared by every table (see app/db/base_class.py::TimestampMixin). */
export interface BaseEntity {
  id: number;
  created_at: string;
  deleted_at: string | null;
}

export interface Organization extends BaseEntity {
  name: string;
  description: string | null;
}

export interface User extends BaseEntity {
  sub: string | null;
  name: string;
  nickname: string | null;
  organization_id: number | null;
  age: number | null;
  region_id: number | null;
}

/** An archery session/competition, made up of one or more rounds. */
export interface Game extends BaseEntity {
  user_id: number;
  recorded_at: string;
  game_size: number | null;
}

/** A round within a game, made up of one or more ends. */
export interface Round extends BaseEntity {
  game_id: number;
  user_id: number;
  number: number;
  recorded_at: string;
  end_size: number;
  round_size: number | null;
  distance_m: number;
  /** Target face, e.g. "122cm". */
  target_type: string;
}

/** An end within a round: a group of arrows shot together, each recorded as a Point. */
export interface End extends BaseEntity {
  round_id: number;
  user_id: number;
  number: number;
  recorded_at: string;
}

/** A single arrow's result within an end: its score and where it hit the target. */
export interface Point extends BaseEntity {
  end_id: number;
  user_id: number;
  number: number;
  score: number;
  x: number;
  y: number;
  recorded_at: string;
}

/** Competition metadata attached to a Game: its name and an optional related link. */
export interface Match extends BaseEntity {
  game_id: number;
  user_id: number;
  name: string;
  link: string | null;
}
