import {
  clearGameId,
  clearNewGameStart,
  loadGameId,
  markNewGameStart,
  saveGameId,
} from "@/lib/storage";
import { toDateOnly } from "@/lib/toDateOnly";
import {
  ApiError,
  createEnd,
  createGame,
  createPoint,
  createRound,
  deleteEnd,
  deleteEndComment,
  deleteGame,
  deleteGameComment,
  deletePoint,
  deleteRound,
  deleteRoundComment,
  getGame,
  listEnds,
  listGameComments,
  listPoints,
  listRounds,
  saveEndComment,
  saveGameComment,
  saveRoundComment,
  type EndRead,
  type GameComments,
  type GameRead,
  type PointRead,
  type RoundRead,
} from "@/lib/api";
import { type CommentTarget } from "@/lib/comment";
import {
  DEFAULT_DISTANCE_M,
  DEFAULT_END_SIZE,
  DEFAULT_GAME_SIZE,
  DEFAULT_ROUND_SIZE,
  DEFAULT_TARGET_TYPE_ID,
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

/** Where the player is on the score sheet, for the entry screen's header. */
export interface ScoreProgress {
  roundNumber: number;
  gameSize: number;
  endNumber: number;
  roundSize: number;
  arrowCount: number;
  endSize: number;
  isEndFull: boolean;
  isGameComplete: boolean;
}

/** One end as the whole-game score sheet shows it. */
export interface SheetEnd {
  number: number;
  points: Array<PointRead>;
  /** The end the player is recording into right now. */
  isCurrent: boolean;
}

/** One round as the whole-game score sheet shows it. */
export interface SheetRound {
  number: number;
  endSize: number;
  ends: Array<SheetEnd>;
}

export class ScoreManager {
  gameId: string | null = null;
  userId: number;
  game: GameRead | null = null;
  /** Distance/target size/arrows per end/end count/round count from the setup screen; only used for brand-new games. */
  setup: RoundSetup | null;

  rounds: Array<RoundRead> = [];
  ends: Array<EndRead> = [];

  currentRound: RoundRead | null = null;
  currentEnd: EndRead | null = null;
  currentPoints: Array<PointRead> = [];

  /**
   * Every comment already written under this game, fetched in one request
   * when the game is loaded. The screen only ever shows the ones on the
   * game and on the round/end being recorded into, so they are looked up
   * by id rather than kept per screen position.
   */
  private comments: GameComments = { game: null, rounds: [], ends: [] };

  /**
   * Arrows already recorded in this game, as recordedPoints[roundIndex][endIndex],
   * so the score sheet can show the whole game and not just the end in progress.
   * The end in progress is deliberately absent: `sheet` reads it from
   * currentPoints, and archiveCurrentEnd() files it here the moment the player
   * moves on to the next end.
   */
  private recordedPoints: Array<Array<Array<PointRead>>> = [];

  constructor(gameId: string | null, userId: number, setup: RoundSetup | null = null) {
    this.gameId = gameId;
    this.userId = userId;
    this.setup = setup;
  }

  /** Rounds planned for this game. */
  get gameSize(): number {
    return this.game?.game_size ?? this.setup?.gameSize ?? DEFAULT_GAME_SIZE;
  }

  /** Ends planned for the current round. */
  get roundSize(): number {
    return this.currentRound?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE;
  }

  /** Arrows planned for each end of the current round. */
  get endSize(): number {
    return this.currentRound?.end_size ?? this.setup?.endSize ?? DEFAULT_END_SIZE;
  }

  get targetType(): string {
    return this.currentRound?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID;
  }

  /** The note on the whole game, if one was written. */
  get gameComment(): string | null {
    return this.comments.game?.body ?? null;
  }

  /** The note on the round being recorded into, if one was written. */
  get roundComment(): string | null {
    const roundId = this.currentRound?.id;
    if (roundId === undefined) return null;
    return this.comments.rounds.find((c) => c.round_id === roundId)?.body ?? null;
  }

  /** The note on the end being recorded into, if one was written. */
  get endComment(): string | null {
    const endId = this.currentEnd?.id;
    if (endId === undefined) return null;
    return this.comments.ends.find((c) => c.end_id === endId)?.body ?? null;
  }

  /** A comment is worth keeping even when no arrow was ever scored. */
  private get hasAnyComment(): boolean {
    return (
      this.comments.game !== null ||
      this.comments.rounds.length > 0 ||
      this.comments.ends.length > 0
    );
  }

  get isEndFull(): boolean {
    return this.currentPoints.length >= this.endSize;
  }

  /** Every planned arrow of every planned end of every planned round is in. */
  get isGameComplete(): boolean {
    return (
      this.isEndFull &&
      this.ends.length >= this.roundSize &&
      this.rounds.length >= this.gameSize
    );
  }

  /** True while the game holds no arrow at all - nothing worth keeping yet. */
  get isEmpty(): boolean {
    return this.rounds.length <= 1 && this.ends.length <= 1 && this.currentPoints.length === 0;
  }

  get progress(): ScoreProgress {
    return {
      roundNumber: this.currentRound?.number ?? 0,
      gameSize: this.gameSize,
      endNumber: this.currentEnd?.number ?? 0,
      roundSize: this.roundSize,
      arrowCount: this.currentPoints.length,
      endSize: this.endSize,
      isEndFull: this.isEndFull,
      isGameComplete: this.isGameComplete,
    };
  }

  /** The whole game as a score sheet: every round, its ends and their arrows. */
  get sheet(): Array<SheetRound> {
    const lastRoundIndex = this.rounds.length - 1;
    const lastEndIndex = this.ends.length - 1;

    return this.rounds.map((round, roundIndex) => ({
      number: round.number,
      endSize: round.end_size ?? DEFAULT_END_SIZE,
      ends: (this.recordedPoints[roundIndex] ?? []).map((points, endIndex) => {
        const isCurrent = roundIndex === lastRoundIndex && endIndex === lastEndIndex;
        return {
          number: endIndex + 1,
          points: isCurrent ? this.currentPoints : points,
          isCurrent,
        };
      }),
    }));
  }

  private get currentRoundPoints(): Array<Array<PointRead>> {
    const recorded = this.recordedPoints[this.recordedPoints.length - 1];
    if (recorded) return recorded;

    const created: Array<Array<PointRead>> = [];
    this.recordedPoints.push(created);
    return created;
  }

  /**
   * Files the end in progress into recordedPoints, right before currentPoints
   * is handed over to a new end.
   */
  private archiveCurrentEnd() {
    if (this.ends.length === 0) return;
    this.currentRoundPoints[this.ends.length - 1] = [...this.currentPoints];
  }

  private async fetchRoundPoints(round: RoundRead): Promise<Array<Array<PointRead>>> {
    if (isPending(round)) return [];
    const ends = await listEnds(round.id);
    return Promise.all(ends.map((end) => listPoints(end.id)));
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

    await this.fetchComments();
    await this.fetchRounds();

    if (!this.currentRound) {
      // addRound() already appends to this.rounds and sets currentRound.
      const round = await this.addRound();
      if (!round) throw new Error("ラウンドを作成できませんでした。");
    } else {
      // fetchRounds() only ever hands back real, already-persisted rounds.
      await this.fetchCurrentEnds();
    }

    if (!this.currentEnd) {
      // addEnd() already appends to this.ends and sets currentEnd.
      const end = await this.addEnd();
      if (!end) throw new Error("エンドを作成できませんでした。");
    } else {
      await this.fetchCurrentPoints();
    }

    // A game put down mid-round comes back with its last end already full;
    // opening straight onto it would swallow every tap. Move on to the end
    // the player would actually shoot next, unless the game is over.
    if (this.isEndFull && !this.isGameComplete) {
      await this.addEnd();
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
    if (this.rounds.length >= this.gameSize) {
      return;
    }

    this.archiveCurrentEnd();

    // Every round in a game shares one setup: reuse the previous round's
    // values so later rounds don't silently fall back to the defaults.
    const previous = this.currentRound;
    const round: RoundRead = {
      id: PENDING_ID,
      game_id: this.game?.id ?? PENDING_ID,
      user_id: this.userId,
      number: previous ? previous.number + 1 : 1,
      recorded_at: toDateOnly(new Date()),
      end_size: previous?.end_size ?? this.setup?.endSize ?? DEFAULT_END_SIZE,
      round_size: previous?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE,
      distance_m: previous?.distance_m ?? this.setup?.distanceM ?? DEFAULT_DISTANCE_M,
      target_type: previous?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID,
      deleted_at: null,
    };

    this.rounds.push(round);
    this.recordedPoints.push([]);
    this.currentRound = round;

    this.ends = [];
    this.currentEnd = null;
    this.currentPoints = [];

    return round;
  }

  async removeRound() {
    if (this.rounds.length <= 1) throw new Error("これ以上前のラウンドはありません。");

    const roundToDelete = this.rounds.pop();
    this.recordedPoints.pop();
    if (!roundToDelete) throw new Error("削除するラウンドを取得できませんでした。");
    if (!isPending(roundToDelete)) {
      await deleteRound(roundToDelete.id);
      this.forgetRoundComment(roundToDelete.id);
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
      throw new Error("ラウンドが開始されていません。");
    }

    if (this.ends.length >= this.roundSize) {
      const round = await this.addRound();
      if (!round) return;
    } else {
      this.archiveCurrentEnd();
    }

    const end: EndRead = {
      id: PENDING_ID,
      round_id: this.currentRound.id,
      user_id: this.userId,
      number: this.currentEnd ? this.currentEnd.number + 1 : 1,
      recorded_at: toDateOnly(new Date()),
    };

    this.ends.push(end);
    this.currentRoundPoints.push([]);
    this.currentEnd = end;

    this.currentPoints = [];

    return end;
  }

  async removeEnd() {
    if (!this.currentRound) {
      throw new Error("ラウンドが開始されていません。");
    }
    if (this.ends.length <= 1) {
      if (this.rounds.length > 1) {
        await this.removeRound();
      } else if (this.currentPoints.length === 0) {
        await this.restartEmptyGame();
      }
      return;
    }
    const endToDelete = this.ends.pop();
    this.recordedPoints[this.recordedPoints.length - 1]?.pop();
    if (!endToDelete) {
      throw new Error("削除するエンドを取得できませんでした。");
    }
    if (!isPending(endToDelete)) {
      await deleteEnd(endToDelete.id);
      this.forgetEndComment(endToDelete.id);
    }

    this.currentEnd = this.ends[this.ends.length - 1] || null;
    if (this.currentEnd && !isPending(this.currentEnd)) {
      await this.fetchCurrentPoints();
    } else {
      this.currentPoints = [];
    }
  }

  /**
   * Backing out past the very first arrow: the game/round/end that
   * ensurePersisted() created are now empty, and leaving them behind would
   * put a 0-arrow game in the score log and the statistics. Delete them and
   * hand back the same still-empty screen, keeping the round shape the
   * player set up.
   */
  private async restartEmptyGame() {
    if (!this.game) return;
    // Backing out of a game the player wrote a comment on: the comment is
    // worth keeping even with no arrow behind it, so leave the game alone.
    if (this.hasAnyComment) return;

    const previous = this.currentRound;
    if (previous) {
      this.setup = {
        distanceM: previous.distance_m,
        targetType: previous.target_type,
        endSize: previous.end_size,
        roundSize: previous.round_size ?? DEFAULT_ROUND_SIZE,
        gameSize: this.gameSize,
      };
    }

    await deleteGame(this.game.id);
    this.forgetGame();

    await this.addRound();
    await this.addEnd();
  }

  private forgetGame() {
    this.game = null;
    this.gameId = null;
    this.comments = { game: null, rounds: [], ends: [] };
    clearGameId();
    markNewGameStart();
    this.rounds = [];
    this.ends = [];
    this.recordedPoints = [];
    this.currentRound = null;
    this.currentEnd = null;
    this.currentPoints = [];
  }

  /**
   * Drops the trailing end/round/game the player never put an arrow in,
   * right before leaving the entry screen. Returns whether any scored game
   * is left to show. Undoing an arrow leaves its end persisted but empty,
   * so without this a score sheet can end on a blank row.
   */
  async discardEmptyTail(): Promise<boolean> {
    if (!this.game || this.currentPoints.length > 0) return this.game !== null;

    // An end/round/game carrying a comment is not an empty tail: the note
    // is the record, so it stays even though no arrow was scored in it.
    const trailingEnd = this.ends[this.ends.length - 1];
    if (trailingEnd && this.endComment !== null) return true;

    const end = this.ends.pop();
    this.recordedPoints[this.recordedPoints.length - 1]?.pop();
    if (end && !isPending(end)) {
      await deleteEnd(end.id);
      this.forgetEndComment(end.id);
    }
    this.currentEnd = this.ends[this.ends.length - 1] || null;
    if (this.ends.length > 0) return true;

    const trailingRound = this.rounds[this.rounds.length - 1];
    if (trailingRound && this.roundComment !== null) return true;

    const round = this.rounds.pop();
    this.recordedPoints.pop();
    if (round && !isPending(round)) {
      await deleteRound(round.id);
      this.forgetRoundComment(round.id);
    }
    this.currentRound = this.rounds[this.rounds.length - 1] || null;
    if (this.rounds.length > 0) return true;

    if (this.hasAnyComment) return true;

    await deleteGame(this.game.id);
    this.forgetGame();
    return false;
  }

  async addPoint(score: number, x?: number, y?: number) {
    if (this.isEndFull) {
      return this.currentPoints;
    }

    await this.ensurePersisted();
    if (!this.currentEnd) throw new Error("エンドを作成できませんでした。");

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
      throw new Error("エンドが開始されていません。");
    }
    if (this.currentPoints.length === 0) {
      await this.removeEnd();
      return;
    }

    const pointToDelete = this.currentPoints.pop();
    if (!pointToDelete) {
      throw new Error("削除する矢を取得できませんでした。");
    }

    await deletePoint(pointToDelete.id);
    await this.fetchCurrentPoints();

    return this.currentPoints;
  }

  async fetchComments() {
    if (!this.game) return;
    this.comments = await listGameComments(this.game.id);
  }

  /**
   * Writes the note on the game, the round in progress or the end in
   * progress, replacing the one already stored for it. An empty text
   * removes the comment instead. Like scoring an arrow, this is the first
   * thing that can turn the still-local game/round/end into real rows.
   */
  async saveComment(target: CommentTarget, body: string) {
    const text = body.trim();
    if (text.length === 0) {
      await this.removeComment(target);
      return;
    }

    await this.ensurePersisted();

    if (target === "game") {
      const game = this.game;
      if (!game) throw new Error("ゲームを作成できませんでした。");
      this.comments.game = await saveGameComment(game.id, text);
      return;
    }

    if (target === "round") {
      const round = this.currentRound;
      if (!round || isPending(round)) throw new Error("ラウンドを作成できませんでした。");
      const saved = await saveRoundComment(round.id, text);
      this.comments.rounds = [
        ...this.comments.rounds.filter((c) => c.round_id !== round.id),
        saved,
      ];
      return;
    }

    const end = this.currentEnd;
    if (!end || isPending(end)) throw new Error("エンドを作成できませんでした。");
    const saved = await saveEndComment(end.id, text);
    this.comments.ends = [...this.comments.ends.filter((c) => c.end_id !== end.id), saved];
  }

  private async removeComment(target: CommentTarget) {
    if (target === "game") {
      const game = this.game;
      if (!game || this.comments.game === null) return;
      await deleteGameComment(game.id);
      this.comments.game = null;
      return;
    }

    if (target === "round") {
      const round = this.currentRound;
      if (!round || this.roundComment === null) return;
      await deleteRoundComment(round.id);
      this.forgetRoundComment(round.id);
      return;
    }

    const end = this.currentEnd;
    if (!end || this.endComment === null) return;
    await deleteEndComment(end.id);
    this.forgetEndComment(end.id);
  }

  private forgetRoundComment(roundId: number) {
    this.comments.rounds = this.comments.rounds.filter((c) => c.round_id !== roundId);
  }

  private forgetEndComment(endId: number) {
    this.comments.ends = this.comments.ends.filter((c) => c.end_id !== endId);
  }

  async fetchRounds() {
    if (!this.game)
      throw new Error("ゲームが読み込まれていません。");

    this.rounds = await listRounds(this.game.id);
    this.currentRound = this.rounds[this.rounds.length - 1] || null;

    // fetchCurrentEnds() reloads the last round's ends anyway, so only the
    // rounds already behind the player are fetched here.
    this.recordedPoints = await Promise.all(
      this.rounds.map((round, index) =>
        index < this.rounds.length - 1 ? this.fetchRoundPoints(round) : []
      )
    );
  }

  async fetchCurrentEnds() {
    if (!this.currentRound)
      throw new Error("ラウンドが開始されていません。");

    this.ends = await listEnds(this.currentRound.id);

    this.currentEnd = this.ends[this.ends.length - 1] || null;

    this.recordedPoints[this.rounds.length - 1] = await Promise.all(
      this.ends.map((end) => listPoints(end.id))
    );
  }
  async fetchCurrentPoints() {
    if (!this.currentEnd)
      throw new Error("エンドが開始されていません。");

    this.currentPoints = await listPoints(this.currentEnd.id);
  }
}
