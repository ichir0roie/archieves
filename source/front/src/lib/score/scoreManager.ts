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

/** 応答を失った削除が API に届いていると、書き直しは 404 になる。もう無ければ消せたものとする */
async function ignoreNotFound(removal: Promise<void>): Promise<void> {
  try {
    await removal;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
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

/** API へ書くのを待っているエンド */
interface UnflushedEnd {
  roundIndex: number;
  endIndex: number;
  /** 矢が空でも、エンドを本物にする(後ろへ進むエンドは、仮の物を末尾にしか置けないため) */
  persist: boolean;
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
 * 矢はエンドごとにここへ溜め、API には書かない。エンドを動かすときは位置を先に動かし、そのエンドの分は
 * flushEnd() がバックグラウンドでまとめて登録・削除する(画面の操作を待たせない)。ゲームを終了する
 * ときだけ、書き込みが済むのを待つ。
 * データが消えるのは「1ポイント戻る」だけ。「1エンド戻る・進む」は位置を動かすだけで、
 * 前後のエンドの矢もコメントも消さない。
 *
 * API への書き込みは、すべて writing の列に並べて一つずつ流す。ゲーム・ラウンド・エンドを二重に作ったり、
 * 書き込み中のエンドを消したりしないため。バックグラウンドの書き込みが失敗したら onBackgroundError で
 * 知らせ、そのエンドは unflushed に残して、次のエンド移動・終了・retryUnsaved() のときに書き直す。
 * 通信が切れた失敗(スマホの画面を消す・アプリを切り替える)は、API に届いて書けたあとで応答だけを
 * 失ったのかもしれない。そのまま書き直すと同じ矢を二重に登録するので、以後は書く前に API の中身と
 * 突き合わせる(mayHaveLostResponse)。
 * 仮の物を本物にすると id が変わるので、エンドの round_id や矢の end_id などの親の id は古いままに
 * なりうる。親は位置(roundIndex / endIndex)で引き、これらの欄は読まない。
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

  /** API への書き込みの列。末尾に足したものが、前のものの後に一つずつ流れる */
  private writing: Promise<void> = Promise.resolve();

  /** まだ API に書いていない(または書くのに失敗した)エンド。キーは `ラウンドの位置:エンドの位置` */
  private unflushed = new Map<string, UnflushedEnd>();

  /** 列に並んでいて、まだ終わっていない書き込みの数 */
  private queuedWrites = 0;

  /**
   * 応答を受け取れなかった書き込みがあった。API には届いていたかもしれないので、仮のラウンド・エンド・矢を
   * 作る前に API にもう無いかを確かめる。どの書き込みが届いたかは分からないので、このゲームの間は下ろさない
   */
  private mayHaveLostResponse = false;

  /** バックグラウンドの書き込みが失敗したときに呼ぶ。失敗した分は次の書き込みで書き直す */
  onBackgroundError: ((error: unknown) => void) | null = null;

  /** バックグラウンドの書き込みで、書いていない分が無くなったときに呼ぶ */
  onBackgroundSaved: (() => void) | null = null;

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

    // 途中で置いたゲームは、最後のエンドが満ちた形で戻ってくる。そのまま開くと的を押しても何も
    // 入らないので、次に撃つエンドを開けておく。ゲームの最後のエンドは開けない
    if (this.isEndFull && this.canForwardEnd) {
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

    // 矢が満ちたら、次のエンドへ自動で進む。ラウンドの最後のエンドなら次のラウンドへ。ゲームの
    // 最後のエンドでは進まない(終了で閉じる)。書き込みに失敗しても矢はローカルに残り、次の書き込みで書き直す
    if (this.isEndFull && this.canForwardEnd) {
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
   * 「1エンド戻る」: 前のエンドへ位置を動かし、今のエンドの書き込みはバックグラウンドに回す。何も消さない。
   * ゲームの最初のエンドでは、矢もコメントも無い空のゲームだけを消して、設定の直後の画面に戻す。
   */
  async goBackEnd() {
    if (!this.canBackEnd) return;

    if (this.roundIndex === 0 && this.endIndex === 0) {
      await this.enqueue(() => this.dropEmptyGame());
      return;
    }

    this.scheduleFlush(this.roundIndex, this.endIndex, false);
    if (this.endIndex > 0) {
      this.endIndex -= 1;
    } else {
      this.roundIndex -= 1;
      this.endIndex = this.ends.length - 1;
    }
  }

  /**
   * 「1エンド進む」: 後ろのエンドへ位置を動かし、今のエンドの書き込みはバックグラウンドに回す。
   * いちばん後ろなら、次のエンドを新しく開く。矢が空でも、後ろへ進むエンドは本物にする。
   */
  async goForwardEnd() {
    if (!this.canForwardEnd) return;

    this.scheduleFlush(this.roundIndex, this.endIndex, true);
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

  /** 書き込みを列の末尾に並べる。前のものが失敗していても流す */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    this.queuedWrites += 1;
    const result = this.writing.then(job).catch((e: unknown) => {
      // ApiError は API が応答を返した失敗。それ以外(fetch の TypeError)は応答を受け取れなかった
      if (!(e instanceof ApiError)) this.mayHaveLostResponse = true;
      throw e;
    });
    this.writing = result.then(
      () => undefined,
      () => undefined
    );
    this.writing.then(() => {
      this.queuedWrites -= 1;
    });
    return result;
  }

  /** API にまだ届いていない変更がある(画面を閉じると失われる) */
  get hasUnsavedWrites(): boolean {
    return (
      this.queuedWrites > 0 ||
      this.unflushed.size > 0 ||
      this.deletedPointIds.length > 0 ||
      this.pointsOf.some((round) => round.some((points) => points.some(isPending)))
    );
  }

  /** そのエンドの書き込みをバックグラウンドに回す。失敗は onBackgroundError に渡す */
  private scheduleFlush(roundIndex: number, endIndex: number, persist: boolean) {
    const key = `${roundIndex}:${endIndex}`;
    const queued = this.unflushed.get(key);
    this.unflushed.set(key, {
      roundIndex,
      endIndex,
      persist: persist || (queued?.persist ?? false),
    });
    this.flushInBackground();
  }

  private flushInBackground() {
    this.enqueue(() => this.flushPending()).then(
      () => {
        if (this.unflushed.size === 0) this.onBackgroundSaved?.();
      },
      (e) => this.onBackgroundError?.(e)
    );
  }

  /** 失敗して書いていないエンドを、エンドを動かすのを待たずに書き直す(通信が戻ったときなど) */
  retryUnsaved() {
    if (this.unflushed.size === 0) return;
    this.flushInBackground();
  }

  /**
   * 書いていないエンドを、前のラウンド・エンドから順に書く。ゲーム・ラウンド・エンドは番号の順に
   * 作る。失敗したエンドは unflushed に戻して例外にする(呼び直せば続きから書く)。
   */
  private async flushPending() {
    const jobs = [...this.unflushed.values()].sort(
      (a, b) => a.roundIndex - b.roundIndex || a.endIndex - b.endIndex
    );
    for (const job of jobs) {
      const key = `${job.roundIndex}:${job.endIndex}`;
      // 書いている間に同じエンドがまた予約されても落とさないよう、先に外す
      this.unflushed.delete(key);
      try {
        const end = this.endsOf[job.roundIndex]?.[job.endIndex];
        if (!end) continue;
        await this.flushEnd(job.roundIndex, job.endIndex);
        if (job.persist && isPending(this.endsOf[job.roundIndex][job.endIndex])) {
          await this.ensurePersisted(job.roundIndex, job.endIndex);
        }
      } catch (e) {
        const queued = this.unflushed.get(key);
        this.unflushed.set(key, { ...job, persist: job.persist || (queued?.persist ?? false) });
        throw e;
      }
    }
  }

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
    if (isPending(round) && this.mayHaveLostResponse) {
      const number = round.number;
      round = (await listRounds(game.id)).find((r) => r.number === number) ?? round;
      this.rounds[roundIndex] = round;
    }
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

    let end = this.endsOf[roundIndex][endIndex];
    if (isPending(end) && this.mayHaveLostResponse) {
      const number = end.number;
      end = (await listEnds(round.id)).find((e) => e.number === number) ?? end;
      this.endsOf[roundIndex][endIndex] = end;
    }
    if (isPending(end)) {
      this.endsOf[roundIndex][endIndex] = await createEnd(round.id, end.number);
    }
  }

  /**
   * 応答を失った矢の登録が API に届いていたら、その矢を仮の矢の代わりに使う。同じ番号に仮の矢が無い
   * (書いている間に外された)・点数が違う矢は、API から消す側に回す。
   */
  private async adoptLostPoints(roundIndex: number, endIndex: number) {
    const end = this.endsOf[roundIndex][endIndex];
    const points = this.pointsOf[roundIndex][endIndex];
    const knownIds = new Set([
      ...points.map((point) => point.id),
      ...this.deletedPointIds,
    ]);
    for (const saved of await listPoints(end.id)) {
      if (knownIds.has(saved.id)) continue;
      const local = points[saved.number - 1];
      if (
        local &&
        isPending(local) &&
        local.score === saved.score &&
        local.x === saved.x &&
        local.y === saved.y
      ) {
        points[saved.number - 1] = saved;
      } else {
        this.deletedPointIds.push(saved.id);
      }
    }
  }

  /**
   * そのエンドの変更をまとめて API に書く。外した矢を消し、まだ登録していない矢を順に登録する。
   * 途中で失敗すると例外になり、ローカルの状態は書けた所までしか進まない(呼び直せば続きから書く)。
   */
  private async flushEnd(roundIndex: number, endIndex: number) {
    await this.deleteRemovedPoints();

    const points = this.pointsOf[roundIndex][endIndex];
    if (!points.some(isPending)) return;

    await this.ensurePersisted(roundIndex, endIndex);
    if (this.mayHaveLostResponse) {
      await this.adoptLostPoints(roundIndex, endIndex);
      await this.deleteRemovedPoints();
    }
    const end = this.endsOf[roundIndex][endIndex];
    // 書いている間も画面は動くので、写しを取って回し、位置は書く直前に引き直す
    for (const point of points.filter(isPending)) {
      const index = points.indexOf(point);
      // 順番待ちの間に「1ポイント戻る」で外された
      if (index === -1) continue;
      const created = await createPoint(end.id, {
        number: index + 1,
        score: point.score,
        x: point.x,
        y: point.y,
      });
      const current = points.indexOf(point);
      if (current === -1) {
        // 書いている間に外された。登録してしまった分を消す
        this.deletedPointIds.push(created.id);
      } else {
        points[current] = created;
      }
    }
    await this.deleteRemovedPoints();
  }

  private async deleteRemovedPoints() {
    while (this.deletedPointIds.length > 0) {
      await ignoreNotFound(deletePoint(this.deletedPointIds[0]));
      this.deletedPointIds.shift();
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

    await ignoreNotFound(deleteGame(game.id));
    this.game = null;
    this.gameId = null;
    this.comments = { game: null, rounds: [], ends: [] };
    clearGameId();
    markNewGameStart();

    this.rounds = [];
    this.endsOf = [];
    this.pointsOf = [];
    this.deletedPointIds = [];
    this.unflushed.clear();
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
      await ignoreNotFound(deleteEnd(end.id));
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
      await ignoreNotFound(deleteRound(round.id));
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
   * 入力の画面を離れる直前に、書いていない分と今のエンドを API へ書き(終わるまで待つ)、矢の無い末尾のエンド・ラウンド・ゲームを消す。
   * 残るゲームがあれば true。矢を外すとそのエンドは空のまま残るので、これが無いとスコア表の
   * 末尾に空の行が出る。コメントの付いたエンド・ラウンド・ゲームは空でも記録なので残す。
   */
  async discardEmptyTail(): Promise<boolean> {
    return this.enqueue(() => this.discardEmptyTailNow());
  }

  /** 書き込みの列の中で動く。バックグラウンドの分も含め、全部書き終えてから後始末する */
  private async discardEmptyTailNow(): Promise<boolean> {
    this.unflushed.set(`${this.roundIndex}:${this.endIndex}`, {
      roundIndex: this.roundIndex,
      endIndex: this.endIndex,
      persist: false,
    });
    await this.flushPending();
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
    // 順番待ちの間に画面のエンドが動いても、押したときのエンドに書く
    const { roundIndex, endIndex } = this;
    await this.enqueue(() => this.saveCommentAt(target, body, roundIndex, endIndex));
  }

  private async saveCommentAt(
    target: CommentTarget,
    body: string,
    roundIndex: number,
    endIndex: number
  ) {
    const text = body.trim();
    if (text.length === 0) {
      await this.removeComment(target, roundIndex, endIndex);
      return;
    }

    await this.ensurePersisted(roundIndex, endIndex);

    if (target === "game") {
      const game = this.game;
      if (!game) throw new Error("ゲームを作成できませんでした。");
      this.comments.game = await saveGameComment(game.id, text);
      return;
    }

    if (target === "round") {
      const round = this.rounds[roundIndex];
      if (!round || isPending(round)) throw new Error("ラウンドを作成できませんでした。");
      const saved = await saveRoundComment(round.id, text);
      this.forgetRoundComment(round.id);
      this.comments.rounds.push(saved);
      return;
    }

    const end = this.endsOf[roundIndex]?.[endIndex];
    if (!end || isPending(end)) throw new Error("エンドを作成できませんでした。");
    const saved = await saveEndComment(end.id, text);
    this.forgetEndComment(end.id);
    this.comments.ends.push(saved);
  }

  private async removeComment(target: CommentTarget, roundIndex: number, endIndex: number) {
    if (target === "game") {
      const game = this.game;
      if (!game || this.comments.game === null) return;
      await ignoreNotFound(deleteGameComment(game.id));
      this.comments.game = null;
      return;
    }

    if (target === "round") {
      const round = this.rounds[roundIndex];
      if (!round || this.roundCommentOf(round) === null) return;
      await ignoreNotFound(deleteRoundComment(round.id));
      this.forgetRoundComment(round.id);
      return;
    }

    const end = this.endsOf[roundIndex]?.[endIndex];
    if (!end || this.endCommentOf(end) === null) return;
    await ignoreNotFound(deleteEndComment(end.id));
    this.forgetEndComment(end.id);
  }

  private forgetRoundComment(roundId: number) {
    this.comments.rounds = this.comments.rounds.filter((c) => c.round_id !== roundId);
  }

  private forgetEndComment(endId: number) {
    this.comments.ends = this.comments.ends.filter((c) => c.end_id !== endId);
  }
}
