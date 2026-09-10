import {
  clearNewGameStart,
  loadGameId,
  saveGameId,
} from "@/modules/functions/localStorage";
import { toDateOnly } from "@/lib/date/toDateOnly";
import {
  ApiError,
  createEnd,
  createGame,
  createPoint,
  createRound,
  deleteEnd,
  deletePoint,
  deleteRound,
  getGame,
  listEnds,
  listPoints,
  listRounds,
  type EndRead,
  type GameRead,
  type PointRead,
  type RoundRead,
} from "@/lib/api";
import {
  DEFAULT_ROUND_SIZE,
  DEFAULT_DISTANCE_M,
  DEFAULT_END_SIZE,
  DEFAULT_TARGET_TYPE_ID,
  MAX_ROUNDS,
  type RoundSetup,
} from "./scoreConfig";

export type { GameRead, RoundRead, EndRead, PointRead };

/**
 * Sentinel id for a round/end that only exists in memory. Real ids come from
 * the database and are always positive, so this can never collide with one.
 * Rounds/ends are built with this id the moment the UI needs to show them
 * (e.g. a fresh "END 1/6" header) but are only sent to the backend once the
 * player records their first point in them - see `ensurePersisted()`. This
 * is what stops an abandoned game (setup screen opened, then backed out of
 * before scoring anything) from leaving an empty game/round/end behind.
 */
const PENDING_ID = -1;

function isPending(entity: { id: number }): boolean {
  return entity.id === PENDING_ID;
}

export class ScoreManager {
  gameId: string | null = null;
  userId: number;
  game: GameRead | null = null;
  /** Distance/target size/end count/round count from the setup screen; only used for brand-new games. */
  setup: RoundSetup | null;

  rounds: Array<RoundRead> = [];
  ends: Array<EndRead> = [];

  currentRound: RoundRead | null = null;
  currentEnd: EndRead | null = null;
  currentPoints: Array<PointRead> = [];

  constructor(gameId: string | null, userId: number, setup: RoundSetup | null = null) {
    this.gameId = gameId;
    this.userId = userId;
    this.setup = setup;
  }

  async setupGame() {
    if (!this.gameId) {
      this.gameId = loadGameId();
    }
    if (this.gameId) {
      try {
        this.game = await getGame(Number(this.gameId));
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        this.gameId = null;
      }
    }

    if (this.game) {
      await this.loadGameData();
    } else {
      // Nothing is written yet: addRound()/addEnd() only prepare the round/end
      // the UI needs to display. The game itself is created lazily, along
      // with this round and end, the first time a point is actually scored.
      await this.addRound();
      await this.addEnd();
    }
  }

  async loadGameData() {
    if (!this.game) return;

    await this.fetchRounds();

    if (!this.currentRound) {
      // addRound() already appends to this.rounds and sets currentRound.
      const round = await this.addRound();
      if (!round) throw new Error("Failed to create initial round.");
    } else {
      // fetchRounds() only ever hands back real, already-persisted rounds.
      await this.fetchCurrentEnds();
    }

    if (!this.currentEnd) {
      // addEnd() already appends to this.ends and sets currentEnd.
      const end = await this.addEnd();
      if (!end) throw new Error("Failed to create initial end.");
    } else {
      await this.fetchCurrentPoints();
    }
  }

  /**
   * Creates whatever this.game/currentRound/currentEnd is still only a local
   * placeholder for, in that order, right before the first point is written
   * to it. Called only from addPoint() - every other mutator stays purely
   * local until this runs.
   */
  private async ensurePersisted() {
    let game = this.game;
    if (!game) {
      game = await createGame(this.userId, new Date(), this.setup?.gameSize);
      this.game = game;
      this.gameId = String(game.id);
      saveGameId(this.gameId);
      clearNewGameStart();
    }

    let round = this.currentRound;
    if (round && isPending(round)) {
      const persisted = await createRound(game.id, {
        number: round.number,
        endSize: round.end_size,
        roundSize: round.round_size ?? undefined,
        distanceM: round.distance_m,
        targetType: round.target_type,
      });
      this.rounds[this.rounds.length - 1] = persisted;
      this.currentRound = persisted;
      round = persisted;
    }

    const end = this.currentEnd;
    if (round && end && isPending(end)) {
      const persisted = await createEnd(round.id, end.number);
      this.ends[this.ends.length - 1] = persisted;
      this.currentEnd = persisted;
    }
  }

  async addRound() {
    const gameSize = this.game?.game_size ?? this.setup?.gameSize ?? MAX_ROUNDS;
    if (this.rounds.length >= gameSize) {
      return;
    }

    // Every round in a game shares one setup: reuse the previous round's
    // values so later rounds don't silently fall back to the defaults.
    const previous = this.currentRound;
    const round: RoundRead = {
      id: PENDING_ID,
      game_id: this.game?.id ?? PENDING_ID,
      user_id: this.userId,
      number: previous ? previous.number + 1 : 1,
      recorded_at: toDateOnly(new Date()),
      end_size: previous?.end_size ?? DEFAULT_END_SIZE,
      round_size: previous?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE,
      distance_m: previous?.distance_m ?? this.setup?.distanceM ?? DEFAULT_DISTANCE_M,
      target_type: previous?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID,
    };

    this.rounds.push(round);
    this.currentRound = round;

    this.ends = [];
    this.currentEnd = null;
    this.currentPoints = [];

    return round;
  }

  async removeRound() {
    if (this.rounds.length <= 1) throw new Error("No rounds to delete.");

    const roundToDelete = this.rounds.pop();
    if (!roundToDelete) throw new Error("Failed to get the round to delete.");
    if (!isPending(roundToDelete)) {
      await deleteRound(roundToDelete.id);
    }

    this.currentRound = this.rounds[this.rounds.length - 1] || null;
    if (!this.currentRound) return;

    await this.fetchCurrentEnds();

    if (this.ends.length > 0) {
      await this.fetchCurrentPoints();
    } else {
      await this.addEnd();
    }
  }

  async addEnd() {
    if (!this.currentRound) {
      throw new Error("No current round. Call newRound() first.");
    }

    const roundSize = this.currentRound.round_size ?? DEFAULT_ROUND_SIZE;
    if (this.ends.length >= roundSize) {
      return;
    }

    const end: EndRead = {
      id: PENDING_ID,
      round_id: this.currentRound.id,
      user_id: this.userId,
      number: this.currentEnd ? this.currentEnd.number + 1 : 1,
      recorded_at: toDateOnly(new Date()),
    };

    this.ends.push(end);
    this.currentEnd = end;

    this.currentPoints = [];

    return end;
  }

  async removeEnd() {
    if (!this.currentRound) {
      throw new Error("No current round. Call newRound() first.");
    }
    if (this.ends.length <= 1) {
      return;
    }
    const endToDelete = this.ends.pop();
    if (!endToDelete) {
      throw new Error("Failed to get the end to delete.");
    }
    if (!isPending(endToDelete)) {
      await deleteEnd(endToDelete.id);
    }

    this.currentEnd = this.ends[this.ends.length - 1] || null;
    if (this.currentEnd && !isPending(this.currentEnd)) {
      await this.fetchCurrentPoints();
    } else {
      this.currentPoints = [];
    }
  }

  async addPoint(score: number, x?: number, y?: number) {
    await this.ensurePersisted();
    if (!this.currentEnd) throw new Error("Failed to create a new end.");

    const endSize = this.currentRound?.end_size ?? DEFAULT_END_SIZE;
    if (this.currentPoints.length >= endSize) {
      return;
    }

    const newPoint = await createPoint(this.currentEnd.id, {
      number:
        this.currentPoints.length > 0
          ? this.currentPoints[this.currentPoints.length - 1].number + 1
          : 1,
      score,
      x: x ?? 0,
      y: y ?? 0,
    });

    this.currentPoints.push(newPoint);

    return this.currentPoints;
  }

  async removePoint() {
    if (!this.currentEnd) {
      throw new Error("No current end. Call newEnd() first.");
    }
    if (this.currentPoints.length === 0) {
      await this.removeEnd();
      return;
    }

    const pointToDelete = this.currentPoints.pop();
    if (!pointToDelete) {
      throw new Error("Failed to get the point to delete.");
    }

    await deletePoint(pointToDelete.id);
    await this.fetchCurrentPoints();

    return this.currentPoints;
  }

  async fetchRounds() {
    if (!this.game)
      throw new Error("Game not initialized. Call setupGame() first.");

    this.rounds = await listRounds(this.game.id);
    this.currentRound = this.rounds[this.rounds.length - 1] || null;
  }

  async fetchCurrentEnds() {
    if (!this.currentRound)
      throw new Error("No current round. Call newRound() first.");

    this.ends = await listEnds(this.currentRound.id);

    this.currentEnd = this.ends[this.ends.length - 1] || null;
  }
  async fetchCurrentPoints() {
    if (!this.currentEnd)
      throw new Error("No current end. Call newEnd() first.");

    this.currentPoints = await listPoints(this.currentEnd.id);
  }
}
