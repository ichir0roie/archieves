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
  DEFAULT_BOW_TYPE,
  DEFAULT_DISTANCE_M,
  DEFAULT_END_SIZE,
  DEFAULT_GAME_SIZE,
  DEFAULT_ROUND_SIZE,
  DEFAULT_TARGET_TYPE_ID,
  type RoundSetup,
} from "./scoreConfig";

export type { GameRead, RoundRead, EndRead, PointRead };

/**
 * まだ API に書いていないラウンド・エンド・矢の id。本物の id は正の数なのでぶつからない。
 * 画面に「END 1/6」を出すために先に形だけ作り、エンドを動かす・終了するときに flushEnd() で
 * 本物にする。設定の画面から来てそのまま離れた、何も撃っていないゲームが db に残らないようにするため。
 * 仮のラウンド・エンドは、いちばん後ろ(末尾)にだけある。
 */
const PENDING_ID = -1;

function isPending(entity: { id: number }): boolean {
  return entity.id === PENDING_ID;
}

/** 入力の画面の帯に出す、今の位置とボタンの可否 */
export interface ScoreProgress {
  roundNumber: number;
  gameSize: number;
  endNumber: number;
  roundSize: number;
  arrowCount: number;
  endSize: number;
  isEndFull: boolean;
  /** ラウンドの最後のエンドまで矢が埋まった */
  isRoundFull: boolean;
  isGameComplete: boolean;
  canBackPoint: boolean;
  canForwardPoint: boolean;
  canBackEnd: boolean;
  canForwardEnd: boolean;
}

/** 「1ポイント戻る」で外した矢。「1ポイント進む」で同じ点数・位置を入れ直す */
interface UndonePoint {
  score: number;
  x: number;
  y: number;
}

function toUndonePoint(point: PointRead): UndonePoint {
  return { score: point.score, x: point.x, y: point.y };
}

/**
 * 点数の入力の画面が持つ、ゲーム・ラウンド・エンド・矢の状態。
 *
 * ゲームの全部(ラウンド・エンド・矢)を持ち、今どこを見ているかを roundIndex / endIndex で表す。
 * 矢はエンドごとにここへ溜め、API には書かない。エンドを動かす・終了するときに、flushEnd() が
 * そのエンドの分をまとめて登録・削除する。
 * データが消えるのは「1ポイント戻る」だけ。「1エンド戻る・進む」は位置を動かすだけで、
 * 前後のエンドの矢もコメントも消さない。
 *
 * API を呼ぶメソッドは、呼び出しが済んでからローカルの状態を変える。途中で失敗しても、
 * 画面に出すものと db が食い違わないようにするため。
 */
export class ScoreManager {
  gameId: string | null = null;
  userId: number;
  game: GameRead | null = null;
  /** 設定の画面で選んだ距離・的・矢数・エンド数・ラウンド数。新しいゲームにだけ使う */
  setup: RoundSetup | null;

  /** rounds[r] のエンドは endsOf[r]、その矢は pointsOf[r][e]。三つは常に同じ形 */
  rounds: Array<RoundRead> = [];
  private endsOf: Array<Array<EndRead>> = [];
  private pointsOf: Array<Array<Array<PointRead>>> = [];

  /** 今見ているラウンド・エンドの位置 */
  private roundIndex = 0;
  private endIndex = 0;

  /**
   * このゲームに書かれたコメント全部。読み込み時に一度で取る。画面に出すのはゲームと
   * 今のラウンド・エンドの分だけなので、位置でなく id で引く。
   */
  private comments: GameComments = { game: null, rounds: [], ends: [] };

  /**
   * 「1ポイント戻る」で外した矢の控え。キーは `ラウンドの位置:エンドの位置`。エンドごとに持つので、
   * 別のエンドへ動いて戻っても残る。そのエンドに新しく矢を撃つと、そのエンドの分だけ捨てる。
   */
  private undonePoints = new Map<string, Array<UndonePoint>>();

  /** 「1ポイント戻る」で外した、API に登録済みの矢。次の flushEnd() で API から消す */
  private deletedPointIds: Array<number> = [];

  constructor(gameId: string | null, userId: number, setup: RoundSetup | null = null) {
    this.gameId = gameId;
    this.userId = userId;
    this.setup = setup;
  }

  // ---- 今の位置 ----

  get currentRound(): RoundRead | null {
    return this.rounds[this.roundIndex] ?? null;
  }

  private get ends(): Array<EndRead> {
    return this.endsOf[this.roundIndex] ?? [];
  }

  get currentEnd(): EndRead | null {
    return this.ends[this.endIndex] ?? null;
  }

  /** 今のエンドの矢。同じ配列を返すので、呼ぶ側は写しを取ってから使う */
  get currentPoints(): Array<PointRead> {
    return this.pointsOf[this.roundIndex]?.[this.endIndex] ?? [];
  }

  private get undoneKey(): string {
    return `${this.roundIndex}:${this.endIndex}`;
  }

  private get currentUndone(): Array<UndonePoint> {
    return this.undonePoints.get(this.undoneKey) ?? [];
  }

  /** ゲームのいちばん後ろのエンドを見ている */
  private get isAtTail(): boolean {
    return this.roundIndex === this.rounds.length - 1 && this.endIndex === this.ends.length - 1;
  }

  // ---- ゲームの形 ----

  /** このゲームのラウンド数 */
  get gameSize(): number {
    return this.game?.game_size ?? this.setup?.gameSize ?? DEFAULT_GAME_SIZE;
  }

  /** 今のラウンドのエンド数 */
  get roundSize(): number {
    return this.currentRound?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE;
  }

  /** 今のラウンドの、1 エンドの矢数 */
  get endSize(): number {
    return this.currentRound?.end_size ?? this.setup?.endSize ?? DEFAULT_END_SIZE;
  }

  get targetType(): string {
    return this.currentRound?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID;
  }

  get isEndFull(): boolean {
    return this.currentPoints.length >= this.endSize;
  }

  get isRoundFull(): boolean {
    return this.ends.length >= this.roundSize && this.endIndex === this.roundSize - 1 && this.isEndFull;
  }

  /** 最後のエンドまで来て、全ラウンドの全エンドの矢が入った */
  get isGameComplete(): boolean {
    return (
      this.isAtTail &&
      this.isEndFull &&
      this.ends.length >= this.roundSize &&
      this.rounds.length >= this.gameSize
    );
  }

  private get hasAnyPoint(): boolean {
    return this.pointsOf.some((round) => round.some((points) => points.length > 0));
  }

  // ---- コメント ----

  get gameComment(): string | null {
    return this.comments.game?.body ?? null;
  }

  get roundComment(): string | null {
    return this.roundCommentOf(this.currentRound);
  }

  get endComment(): string | null {
    return this.endCommentOf(this.currentEnd);
  }

  private roundCommentOf(round: RoundRead | null | undefined): string | null {
    if (!round) return null;
    return this.comments.rounds.find((c) => c.round_id === round.id)?.body ?? null;
  }

  private endCommentOf(end: EndRead | null | undefined): string | null {
    if (!end) return null;
    return this.comments.ends.find((c) => c.end_id === end.id)?.body ?? null;
  }

  /** 矢が一本も無くても、コメントがあるゲームは残す値打ちがある */
  private get hasAnyComment(): boolean {
    return (
      this.comments.game !== null ||
      this.comments.rounds.length > 0 ||
      this.comments.ends.length > 0
    );
  }

  // ---- ボタンの可否 ----

  get canBackPoint(): boolean {
    return this.currentPoints.length > 0;
  }

  get canForwardPoint(): boolean {
    return this.currentUndone.length > 0 && !this.isEndFull;
  }

  /** 空のゲームを消して設定の直後に戻せる: db にゲームがあり、矢もコメントも無い */
  private get canDropEmptyGame(): boolean {
    return this.game !== null && !this.hasAnyPoint && !this.hasAnyComment;
  }

  /** 前のエンドがあるか、ゲームの最初のエンドで消せる空のゲームがある */
  get canBackEnd(): boolean {
    return this.roundIndex > 0 || this.endIndex > 0 || this.canDropEmptyGame;
  }

  /**
   * 後ろにエンドがあれば進める。いちばん後ろでは、矢が空でも次を開ける(撃たなかったエンドを飛ばせる)。
   * ゲームの最後のエンドからは進めない(終了で閉じる)。
   */
  get canForwardEnd(): boolean {
    if (!this.isAtTail) return true;
    return this.ends.length < this.roundSize || this.rounds.length < this.gameSize;
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
      isRoundFull: this.isRoundFull,
      isGameComplete: this.isGameComplete,
      canBackPoint: this.canBackPoint,
      canForwardPoint: this.canForwardPoint,
      canBackEnd: this.canBackEnd,
      canForwardEnd: this.canForwardEnd,
    };
  }

  // ---- 読み込み ----

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
      await this.loadGameData(this.game);
    } else {
      // まだ何も書いていない。画面に出すためのラウンド・エンドの形だけ作る
      this.openNextRound();
    }
  }

  private async loadGameData(game: GameRead) {
    const [comments, rounds] = await Promise.all([
      listGameComments(game.id),
      listRounds(game.id),
    ]);
    const endsOf = await Promise.all(rounds.map((round) => listEnds(round.id)));
    const pointsOf = await Promise.all(
      endsOf.map((ends) => Promise.all(ends.map((end) => listPoints(end.id))))
    );

    this.comments = comments;
    this.rounds = rounds;
    this.endsOf = endsOf;
    this.pointsOf = pointsOf;
    this.deletedPointIds = [];
    this.undonePoints.clear();

    if (rounds.length === 0) {
      this.openNextRound();
      return;
    }

    this.roundIndex = rounds.length - 1;
    if (this.ends.length === 0) {
      this.pushPendingEnd();
    } else {
      this.endIndex = this.ends.length - 1;
    }

    // ラウンドの途中で置いたゲームは、最後のエンドが満ちた形で戻ってくる。そのまま開くと
    // 的を押しても何も入らないので、次に撃つエンドを開けておく。次のラウンドへは手動で進むので、
    // ラウンドの最後のエンドは開けない
    if (this.isEndFull && this.endIndex < this.roundSize - 1) {
      this.openNextEnd();
    }
  }

  // ---- ラウンド・エンドを開く(ローカルだけ) ----

  /**
   * 次のラウンドをローカルに開く(ラウンドとその最初のエンド)。ゲームが満ちていれば何もせず false。
   * ゲームの中のラウンドは同じ設定なので、前のラウンドの値を引き継ぐ。
   */
  private openNextRound(): boolean {
    if (this.rounds.length >= this.gameSize) return false;

    const previous = this.rounds[this.rounds.length - 1];
    this.rounds.push({
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
    });
    this.endsOf.push([]);
    this.pointsOf.push([]);
    this.roundIndex = this.rounds.length - 1;
    this.pushPendingEnd();
    return true;
  }

  /** いちばん後ろに次のエンドを開く。ラウンドが満ちていれば次のラウンドへ。開けなければ false */
  private openNextEnd(): boolean {
    this.roundIndex = this.rounds.length - 1;
    if (this.ends.length >= this.roundSize) {
      return this.openNextRound();
    }
    this.pushPendingEnd();
    return true;
  }

  /** 今のラウンドの末尾に仮のエンドを足し、そこを見る */
  private pushPendingEnd() {
    const round = this.currentRound;
    if (!round) throw new Error("ラウンドが開始されていません。");
    const ends = this.endsOf[this.roundIndex];
    ends.push({
      id: PENDING_ID,
      round_id: round.id,
      user_id: this.userId,
      number: ends.length + 1,
      recorded_at: toDateOnly(new Date()),
    });
    this.pointsOf[this.roundIndex].push([]);
    this.endIndex = ends.length - 1;
  }

  // ---- 矢(ローカルだけ。API へは flushEnd で書く) ----

  private newLocalPoint(point: UndonePoint, number: number): PointRead {
    return {
      id: PENDING_ID,
      end_id: this.currentEnd?.id ?? PENDING_ID,
      user_id: this.userId,
      number,
      score: point.score,
      x: point.x,
      y: point.y,
      x_cm: null,
      y_cm: null,
      recorded_at: toDateOnly(new Date()),
    };
  }

  /** 矢を一本記録する。エンドが満ちていれば何もしない */
  async addPoint(score: number, x: number = 0, y: number = 0) {
    if (this.isEndFull || !this.currentEnd) return;

    // 新しく撃った矢で、このエンドの履歴が分かれる
    this.undonePoints.delete(this.undoneKey);
    const points = this.currentPoints;
    points.push(this.newLocalPoint({ score, x, y }, points.length + 1));

    // 矢が満ちたら、同じラウンドの次のエンドへ自動で進む。次のラウンドへは手動(goForwardEnd)。
    // 書き込みに失敗しても矢はローカルに残り、「1エンド進む」で書き直せる
    if (this.isEndFull && this.endIndex < this.roundSize - 1) {
      await this.goForwardEnd();
    }
  }

  /** 今のエンドの最後の矢を外す。データが消えるのはここだけ。restorePoint() で入れ直せる */
  async removePoint() {
    const point = this.currentPoints.pop();
    if (!point) return;

    if (!isPending(point)) this.deletedPointIds.push(point.id);
    this.undonePoints.set(this.undoneKey, [...this.currentUndone, toUndonePoint(point)]);
  }

  /** removePoint() で外した矢を入れ直す */
  async restorePoint() {
    if (!this.canForwardPoint) return;

    const undone = [...this.currentUndone];
    const point = undone.pop();
    if (!point) return;
    this.undonePoints.set(this.undoneKey, undone);
    const points = this.currentPoints;
    points.push(this.newLocalPoint(point, points.length + 1));
  }

  // ---- エンドの行き来 ----

  /**
   * 「1エンド戻る」: 今のエンドを API へ書いてから、前のエンドへ位置を動かす。何も消さない。
   * ゲームの最初のエンドでは、矢もコメントも無い空のゲームだけを消して、設定の直後の画面に戻す。
   */
  async goBackEnd() {
    if (!this.canBackEnd) return;

    if (this.roundIndex === 0 && this.endIndex === 0) {
      await this.dropEmptyGame();
      return;
    }

    await this.flushEnd(this.roundIndex, this.endIndex);
    if (this.endIndex > 0) {
      this.endIndex -= 1;
    } else {
      this.roundIndex -= 1;
      this.endIndex = this.ends.length - 1;
    }
  }

  /**
   * 「1エンド進む」: 今のエンドを API へ書いてから、後ろのエンドへ位置を動かす。
   * いちばん後ろなら、次のエンドを新しく開く。
   */
  async goForwardEnd() {
    if (!this.canForwardEnd) return;

    await this.flushEnd(this.roundIndex, this.endIndex);
    // 矢が空でも、後ろへ進むエンドは本物にする。仮の物は末尾にしか置けない
    if (isPending(this.ends[this.endIndex])) {
      await this.ensurePersisted(this.roundIndex, this.endIndex);
    }
    if (!this.isAtTail) {
      if (this.endIndex < this.ends.length - 1) {
        this.endIndex += 1;
      } else {
        this.roundIndex += 1;
        this.endIndex = 0;
      }
      return;
    }
    this.openNextEnd();
  }

  // ---- API への書き込み ----

  /**
   * ゲーム・ラウンド・エンドのうち、まだ仮の物を API に作る。矢・コメントを書く直前にだけ呼ぶ。
   * 仮の物は末尾にしか無いので、渡された位置のものを作る。
   */
  private async ensurePersisted(roundIndex: number, endIndex: number) {
    let game = this.game;
    if (!game) {
      game = await createGame(this.userId, new Date(), this.setup?.gameSize, this.setup?.bowType);
      this.game = game;
      this.gameId = String(game.id);
      saveGameId(this.gameId);
      clearNewGameStart();
    }

    let round = this.rounds[roundIndex];
    if (isPending(round)) {
      round = await createRound(game.id, {
        number: round.number,
        endSize: round.end_size,
        roundSize: round.round_size ?? undefined,
        distanceM: round.distance_m,
        targetType: round.target_type,
      });
      this.rounds[roundIndex] = round;
    }

    const end = this.endsOf[roundIndex][endIndex];
    if (isPending(end)) {
      this.endsOf[roundIndex][endIndex] = await createEnd(round.id, end.number);
    }
  }

  /**
   * そのエンドの変更をまとめて API に書く。外した矢を消し、まだ登録していない矢を順に登録する。
   * 途中で失敗すると例外になり、ローカルの状態は書けた所までしか進まない(呼び直せば続きから書く)。
   */
  private async flushEnd(roundIndex: number, endIndex: number) {
    while (this.deletedPointIds.length > 0) {
      await deletePoint(this.deletedPointIds[0]);
      this.deletedPointIds.shift();
    }

    const points = this.pointsOf[roundIndex][endIndex];
    if (!points.some(isPending)) return;

    await this.ensurePersisted(roundIndex, endIndex);
    const end = this.endsOf[roundIndex][endIndex];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!isPending(point)) continue;
      points[i] = await createPoint(end.id, {
        number: i + 1,
        score: point.score,
        x: point.x,
        y: point.y,
      });
    }
  }

  // ---- 後始末 ----

  /** 何も残っていないゲームを消し、同じ設定の空の画面(未保存のラウンド・エンド)に戻す */
  private async dropEmptyGame() {
    const game = this.game;
    if (!game) return;

    const previous = this.currentRound;
    if (previous) {
      this.setup = {
        bowType: game.bow_type ?? this.setup?.bowType ?? DEFAULT_BOW_TYPE,
        distanceM: previous.distance_m,
        targetType: previous.target_type,
        endSize: previous.end_size,
        roundSize: previous.round_size ?? DEFAULT_ROUND_SIZE,
        gameSize: this.gameSize,
      };
    }

    await deleteGame(game.id);
    this.game = null;
    this.gameId = null;
    this.comments = { game: null, rounds: [], ends: [] };
    clearGameId();
    markNewGameStart();

    this.rounds = [];
    this.endsOf = [];
    this.pointsOf = [];
    this.deletedPointIds = [];
    this.undonePoints.clear();
    this.roundIndex = 0;
    this.endIndex = 0;
    this.openNextRound();
  }

  /** いちばん後ろのエンドを(API に登録済みなら API からも)消す。ラウンドの最後の一つには使わない */
  private async removeTailEnd() {
    const roundIndex = this.rounds.length - 1;
    const ends = this.endsOf[roundIndex];
    const end = ends[ends.length - 1];
    if (!isPending(end)) {
      await deleteEnd(end.id);
      this.comments.ends = this.comments.ends.filter((c) => c.end_id !== end.id);
    }
    ends.pop();
    this.pointsOf[roundIndex].pop();
    this.clampPosition();
  }

  /** いちばん後ろのラウンドを(登録済みなら API からも)消す */
  private async removeTailRound() {
    const roundIndex = this.rounds.length - 1;
    const round = this.rounds[roundIndex];
    if (!isPending(round)) {
      await deleteRound(round.id);
      const endIds = this.endsOf[roundIndex].map((end) => end.id);
      this.comments.rounds = this.comments.rounds.filter((c) => c.round_id !== round.id);
      this.comments.ends = this.comments.ends.filter((c) => !endIds.includes(c.end_id));
    }
    this.rounds.pop();
    this.endsOf.pop();
    this.pointsOf.pop();
    this.clampPosition();
  }

  private clampPosition() {
    this.roundIndex = Math.max(Math.min(this.roundIndex, this.rounds.length - 1), 0);
    this.endIndex = Math.max(Math.min(this.endIndex, this.ends.length - 1), 0);
  }

  /**
   * 入力の画面を離れる直前に、今のエンドを API へ書き、矢の無い末尾のエンド・ラウンド・ゲームを消す。
   * 残るゲームがあれば true。矢を外すとそのエンドは空のまま残るので、これが無いとスコア表の
   * 末尾に空の行が出る。コメントの付いたエンド・ラウンド・ゲームは空でも記録なので残す。
   */
  async discardEmptyTail(): Promise<boolean> {
    await this.flushEnd(this.roundIndex, this.endIndex);
    if (!this.game) return false;

    for (;;) {
      const roundIndex = this.rounds.length - 1;
      const ends = this.endsOf[roundIndex];
      const endIndex = ends.length - 1;

      if (this.pointsOf[roundIndex][endIndex].length > 0) return true;
      if (this.endCommentOf(ends[endIndex]) !== null) return true;
      if (ends.length > 1) {
        await this.removeTailEnd();
        continue;
      }

      if (this.roundCommentOf(this.rounds[roundIndex]) !== null) return true;
      if (this.rounds.length > 1) {
        await this.removeTailRound();
        continue;
      }

      if (this.hasAnyComment) return true;
      await this.dropEmptyGame();
      return false;
    }
  }

  // ---- コメント ----

  /**
   * ゲーム・今のラウンド・今のエンドのコメントを書く(あれば置き換える)。空文字なら消す。
   * コメントは仮のゲーム・ラウンド・エンドを本物にする最初のきっかけになりうる。矢は
   * エンドを動かすときまで溜めたままにする。
   */
  async saveComment(target: CommentTarget, body: string) {
    const text = body.trim();
    if (text.length === 0) {
      await this.removeComment(target);
      return;
    }

    await this.ensurePersisted(this.roundIndex, this.endIndex);

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
      this.forgetRoundComment(round.id);
      this.comments.rounds.push(saved);
      return;
    }

    const end = this.currentEnd;
    if (!end || isPending(end)) throw new Error("エンドを作成できませんでした。");
    const saved = await saveEndComment(end.id, text);
    this.forgetEndComment(end.id);
    this.comments.ends.push(saved);
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
}
