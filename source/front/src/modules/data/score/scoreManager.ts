import { loadGameId, saveGameId } from "@/modules/functions/localStorage";
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
  DEFAULT_TARGET_SIZE,
  MAX_ROUNDS,
  type RoundSetup,
} from "./scoreConfig";

export type { GameRead, RoundRead, EndRead, PointRead };

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
    let game: GameRead | null = null;

    if (!this.gameId) {
      this.gameId = loadGameId();
    }
    if (this.gameId) {
      try {
        game = await getGame(Number(this.gameId));
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    }
    if (!game) {
      this.game = await createGame(this.userId, new Date(), this.setup?.gameSize);
      this.gameId = String(this.game.id);
      saveGameId(this.gameId);
    } else {
      this.game = game;
    }

    // Load rounds, ends, and points
    await this.loadGameData();
  }

  async loadGameData() {
    if (!this.game) return;

    // Load all rounds for this game
    await this.fetchRounds();

    if (!this.currentRound) {
      // addRound() already appends to this.rounds and sets currentRound.
      const round = await this.addRound();
      if (!round) throw new Error("Failed to create initial round.");
    }

    // Load all ends for the current round
    await this.fetchCurrentEnds();
    if (!this.currentEnd) {
      // addEnd() already appends to this.ends and sets currentEnd.
      const end = await this.addEnd();
      if (!end) throw new Error("Failed to create initial end.");
    }

    await this.fetchCurrentPoints();
  }

  async addRound() {
    if (!this.game) {
      throw new Error("Game not initialized. Call setupGame() first.");
    }

    const gameSize = this.game.game_size ?? this.setup?.gameSize ?? MAX_ROUNDS;
    if (this.rounds.length >= gameSize) {
      return;
    }

    // Every round in a game shares one setup: reuse the previous round's
    // values so later rounds don't silently fall back to the defaults.
    const previous = this.currentRound;
    const round = await createRound(this.game.id, {
      number: previous ? previous.number + 1 : 1,
      endSize: previous?.end_size ?? DEFAULT_END_SIZE,
      roundSize: previous?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE,
      distanceM: previous?.distance_m ?? this.setup?.distanceM ?? DEFAULT_DISTANCE_M,
      targetType: previous?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_SIZE,
    });

    this.rounds.push(round);
    this.currentRound = round;

    this.ends = [];
    this.currentEnd = null;
    this.currentPoints = [];

    return round;
  }

  async removeRound() {
    if (!this.game)
      throw new Error("Game not initialized. Call setupGame() first.");
    if (this.rounds.length <= 1) throw new Error("No rounds to delete.");

    const roundToDelete = this.rounds.pop();
    if (!roundToDelete) throw new Error("Failed to get the round to delete.");
    await deleteRound(roundToDelete.id);

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

    const end = await createEnd(
      this.currentRound.id,
      this.currentEnd ? this.currentEnd.number + 1 : 1
    );

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

    await deleteEnd(endToDelete.id);

    this.currentEnd = this.ends[this.ends.length - 1] || null;
    await this.fetchCurrentPoints();
  }

  async addPoint(score: number, x?: number, y?: number) {
    if (!this.currentEnd) {
      await this.addEnd();
      if (!this.currentEnd) throw new Error("Failed to create a new end.");
    }

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
