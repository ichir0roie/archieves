import { deleteGame, getGameSheet, saveGameSheet, type GameSheetRead } from "@/lib/api";
import { type CommentTarget } from "@/lib/comment";
import { toDateOnly } from "@/lib/toDateOnly";
import {
  DEFAULT_ARROW_DIAMETER_MM,
  DEFAULT_BOW_TYPE,
  DEFAULT_DISTANCE_M,
  DEFAULT_END_SIZE,
  DEFAULT_GAME_SIZE,
  DEFAULT_ROUND_SIZE,
  DEFAULT_TARGET_TYPE_ID,
  type RoundSetup,
} from "./scoreConfig";
import {
  clearScoreSheetCache,
  loadScoreSheetCache,
  saveScoreSheetCache,
} from "@/lib/storage";
import {
  type ScoreSheetCache,
  type Sheet,
  type SheetEnd,
  type SheetPoint,
  type SheetRound,
} from "./scoreSheetCache";
import { totalScore } from "./scoreFunctions";

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
  /** 今のラウンドの合計点 */
  roundTotal: number;
  /** 今のラウンドのエンドごとの合計。矢の無いエンド(まだ開いていないものも)は null */
  endTotals: Array<number | null>;
}

/** 「1矢戻る」で外した矢。「1矢進む」で同じ点数・位置・時刻を入れ直す */
type UndonePoint = Omit<SheetPoint, "id" | "number">;

function today(): string {
  return toDateOnly(new Date());
}

/** 手元の時間帯での、その日("yyyy-mm-dd")の 0 時 */
function startOfDate(date: string): Date {
  // 時差の無い日付と時刻の文字列は、手元の時間帯として読まれる
  return new Date(`${date}T00:00:00`);
}

function hasComment(entity: { comment: string | null }): boolean {
  return entity.comment !== null && entity.comment.trim() !== "";
}

function isBlankEnd(end: SheetEnd): boolean {
  return end.points.length === 0 && !hasComment(end);
}

/** API の応答を、手元の形にする(読むだけの欄を落とす) */
function fromSheetRead(read: GameSheetRead): Sheet {
  return {
    id: read.id,
    client_key: read.client_key,
    recorded_at: read.recorded_at,
    game_size: read.game_size,
    bow_type: read.bow_type,
    arrow_diameter_mm: read.arrow_diameter_mm,
    all_in: read.all_in,
    backfilled: read.backfilled,
    comment: read.comment,
    rounds: read.rounds.map((round) => ({
      id: round.id,
      number: round.number,
      recorded_at: round.recorded_at,
      end_size: round.end_size,
      round_size: round.round_size,
      distance_m: round.distance_m,
      target_type: round.target_type,
      comment: round.comment,
      ends: round.ends.map((end) => ({
        id: end.id,
        number: end.number,
        recorded_at: end.recorded_at,
        comment: end.comment,
        points: end.points.map((point) => ({
          id: point.id,
          number: point.number,
          score: point.score,
          x: point.x,
          y: point.y,
          recorded_at: point.recorded_at,
          shot_at: point.shot_at,
        })),
      })),
    })),
  };
}

/**
 * 点数の入力の画面が持つ、ゲーム・ラウンド・エンド・矢・コメントの状態。
 *
 * 記録は手元(scoreSheetCache.ts)にだけ書き、操作のたびにキャッシュへ写す。API には、保存と終了の
 * ときに丸ごと一度に送る(PUT /games/sheet)。送るまでは、画面を閉じても読み込み直してもキャッシュから戻る。
 * データが消えるのは「1矢戻る」だけ。「1エンド戻る・進む」は位置を動かすだけで、前後のエンドの矢も
 * コメントも消さない。エンドが満ちても次のエンドへは自動で進まない(「1エンド進む」で進む)。
 */
export class ScoreManager {
  /** 入力している利用者(ログインの sub)。キャッシュはこの人のものとして書く */
  private readonly sub: string;
  private sheet: Sheet;
  private setup: RoundSetup | null;
  private roundIndex: number;
  private endIndex: number;
  private dirty: boolean;
  /** 点だけ入力のゲーム。始めるときに決め、途中では変えない */
  readonly numberPad: boolean;

  /**
   * 「1矢戻る」で外した矢の控え。キーは `ラウンドの位置:エンドの位置`。キャッシュには持たない
   * (読み込み直すと「1矢進む」で戻せなくなるだけ)。そのエンドに新しく矢を撃つと、その分を捨てる
   */
  private undonePoints = new Map<string, Array<UndonePoint>>();

  constructor(cache: Omit<ScoreSheetCache, "version">) {
    this.sub = cache.sub;
    this.sheet = cache.sheet;
    this.setup = cache.setup;
    this.roundIndex = cache.roundIndex;
    this.endIndex = cache.endIndex;
    this.dirty = cache.dirty;
    this.numberPad = cache.numberPad;
    if (this.sheet.rounds.length === 0) this.openNextRound();
    this.clampPosition();
  }

  // ---- キャッシュを作る・読む・消す ----

  /**
   * 設定の画面から新しいゲームを始める。前のキャッシュは捨てる。backfillDate("yyyy-mm-dd")を渡すと
   * あとから入力にし、記録の日付・時刻をその日にそろえる。sub は今のログインの利用者
   */
  static startNewGame(
    sub: string,
    setup: RoundSetup,
    backfillDate: string | null = null,
    numberPad: boolean = false,
  ): ScoreManager {
    const manager = new ScoreManager({
      sub,
      sheet: {
        id: null,
        client_key: crypto.randomUUID(),
        recorded_at: backfillDate ?? today(),
        game_size: setup.gameSize,
        bow_type: setup.bowType,
        arrow_diameter_mm: setup.arrowDiameterMm,
        all_in: setup.allIn,
        backfilled: backfillDate !== null,
        comment: null,
        rounds: [],
      },
      setup,
      roundIndex: 0,
      endIndex: 0,
      dirty: false,
      numberPad,
    });
    manager.persist();
    return manager;
  }

  /** 保存したゲームの編集を始める。API から丸ごと読んでキャッシュを作り直し、いちばん後ろのエンドを開く */
  static async startEditing(sub: string, gameId: number): Promise<ScoreManager> {
    const sheet = fromSheetRead(await getGameSheet(gameId));
    const roundIndex = Math.max(sheet.rounds.length - 1, 0);
    const manager = new ScoreManager({
      sub,
      sheet,
      setup: null,
      roundIndex,
      endIndex: Math.max((sheet.rounds[roundIndex]?.ends.length ?? 0) - 1, 0),
      dirty: false,
      // 保存したゲームの編集は的で入れる(記録に入れ方を持たないため)
      numberPad: false,
    });
    if (manager.ends.length === 0) {
      manager.pushEnd();
    } else if (manager.isEndFull && manager.canForwardEnd) {
      // 満ちたエンドで終わっているので、次に撃つエンドを開けておく。ゲームの最後のエンドは開けない
      manager.openNextEnd();
    }
    manager.persist();
    return manager;
  }

  /** キャッシュにある、sub の人の入力の途中のゲーム。無ければ null */
  static resume(sub: string): ScoreManager | null {
    const cache = loadScoreSheetCache(sub);
    return cache ? new ScoreManager(cache) : null;
  }

  /** キャッシュに sub の人の入力の途中のゲームがあり、保存していない変更がある */
  static hasUnsavedCache(sub: string): boolean {
    return loadScoreSheetCache(sub)?.dirty ?? false;
  }

  private persist() {
    saveScoreSheetCache({
      sub: this.sub,
      sheet: this.sheet,
      setup: this.setup,
      roundIndex: this.roundIndex,
      endIndex: this.endIndex,
      dirty: this.dirty,
      numberPad: this.numberPad,
    });
  }

  /** 記録を変えた。キャッシュに写し、保存していない印を付ける */
  private changed() {
    this.dirty = true;
    this.persist();
  }

  // ---- 今の位置 ----

  get gameId(): number | null {
    return this.sheet.id;
  }

  get hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  private get currentRound(): SheetRound | null {
    return this.sheet.rounds[this.roundIndex] ?? null;
  }

  private get ends(): Array<SheetEnd> {
    return this.currentRound?.ends ?? [];
  }

  private get currentEnd(): SheetEnd | null {
    return this.ends[this.endIndex] ?? null;
  }

  /** 今のエンドの矢。同じ配列を返すので、呼ぶ側は写しを取ってから使う */
  get currentPoints(): Array<SheetPoint> {
    return this.currentEnd?.points ?? [];
  }

  private get undoneKey(): string {
    return `${this.roundIndex}:${this.endIndex}`;
  }

  private get currentUndone(): Array<UndonePoint> {
    return this.undonePoints.get(this.undoneKey) ?? [];
  }

  /** ゲームのいちばん後ろのエンドを見ている */
  private get isAtTail(): boolean {
    return (
      this.roundIndex === this.sheet.rounds.length - 1 && this.endIndex === this.ends.length - 1
    );
  }

  // ---- ゲームの形 ----

  get gameSize(): number {
    return this.sheet.game_size ?? this.setup?.gameSize ?? DEFAULT_GAME_SIZE;
  }

  get roundSize(): number {
    return this.currentRound?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE;
  }

  get endSize(): number {
    return this.currentRound?.end_size ?? this.setup?.endSize ?? DEFAULT_END_SIZE;
  }

  /** 矢の直径(mm)。設定する前のゲーム(と、px で持っていた頃のキャッシュ)は既定の太さ */
  get arrowDiameterMm(): number {
    return this.sheet.arrow_diameter_mm ?? DEFAULT_ARROW_DIAMETER_MM;
  }

  /** インサイドアウト: 矢の円が帯に完全に入らなければ、その帯の点にしない */
  get bowType(): string | null {
    return this.sheet.bow_type;
  }

  get allIn(): boolean {
    return this.sheet.all_in;
  }

  /** あとから入力のゲームなら、その日付("yyyy-mm-dd")。入れた時の日付で付けるゲームは null */
  get backfillDate(): string | null {
    return this.sheet.backfilled ? this.sheet.recorded_at : null;
  }

  /** 新しく開くラウンド・エンドと矢に付ける日付 */
  private get recordDate(): string {
    return this.backfillDate ?? today();
  }

  get targetType(): string {
    return this.currentRound?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID;
  }

  get isEndFull(): boolean {
    return this.currentPoints.length >= this.endSize;
  }

  get isRoundFull(): boolean {
    return (
      this.ends.length >= this.roundSize && this.endIndex === this.roundSize - 1 && this.isEndFull
    );
  }

  /** 最後のエンドまで来て、全ラウンドの全エンドの矢が入った */
  get isGameComplete(): boolean {
    return (
      this.isAtTail &&
      this.isEndFull &&
      this.ends.length >= this.roundSize &&
      this.sheet.rounds.length >= this.gameSize
    );
  }

  // ---- ゲームの設定 ----

  /** 設定のモーダルに出す今の設定。ラウンドごとの値(距離・的・数)は今のラウンドのもの */
  get gameSetup(): RoundSetup {
    return {
      bowType: this.bowType ?? this.setup?.bowType ?? DEFAULT_BOW_TYPE,
      distanceM: this.currentRound?.distance_m ?? this.setup?.distanceM ?? DEFAULT_DISTANCE_M,
      targetType: this.targetType,
      endSize: this.endSize,
      roundSize: this.roundSize,
      gameSize: this.gameSize,
      arrowDiameterMm: this.arrowDiameterMm,
      allIn: this.allIn,
    };
  }

  /** 最後のラウンドの、末尾の矢もコメントも無いエンド(開けただけのもの)の数 */
  private get blankTailEnds(): number {
    const ends = this.sheet.rounds[this.sheet.rounds.length - 1]?.ends ?? [];
    let count = 0;
    while (count < ends.length && isBlankEnd(ends[ends.length - 1 - count])) count += 1;
    return count;
  }

  /** 最後のラウンドが、矢もコメントも無い(開けただけのもの) */
  private get isLastRoundBlank(): boolean {
    const round = this.sheet.rounds[this.sheet.rounds.length - 1];
    return round !== undefined && !hasComment(round) && round.ends.every(isBlankEnd);
  }

  /**
   * 設定で小さくできる数の下限。記録した矢・エンド・ラウンドの数。最後のラウンドの末尾の開けただけの
   * エンドと、開けただけの最後のラウンドは数えない(設定を小さくしたら外す。applySetup)
   */
  get setupMinSizes(): { endSize: number; roundSize: number; gameSize: number } {
    const rounds = this.sheet.rounds;
    const endCounts = rounds.map((round) => round.ends.length);
    if (endCounts.length > 0) endCounts[endCounts.length - 1] -= this.blankTailEnds;
    return {
      endSize: Math.max(0, ...rounds.flatMap((round) => round.ends.map((end) => end.points.length))),
      roundSize: Math.max(0, ...endCounts),
      gameSize: rounds.length - (this.isLastRoundBlank ? 1 : 0),
    };
  }

  /**
   * ゲームの設定を変える。変えた値だけを書き、ラウンドごとの値はすべてのラウンドに当てる
   * (ゲームの中のラウンドは同じ設定。取り込んだ古いゲームのラウンドごとに違う値は、変えなければ残す)。
   * 数は setupMinSizes より小さくしない前提。記録済みの矢の点数は、的を変えても付け直さない
   */
  applySetup(next: RoundSetup) {
    const current = this.gameSetup;
    if (next.bowType !== current.bowType) this.sheet.bow_type = next.bowType;
    if (next.arrowDiameterMm !== current.arrowDiameterMm) {
      this.sheet.arrow_diameter_mm = next.arrowDiameterMm;
    }
    if (next.allIn !== current.allIn) this.sheet.all_in = next.allIn;
    if (next.gameSize !== current.gameSize) this.sheet.game_size = next.gameSize;
    for (const round of this.sheet.rounds) {
      if (next.distanceM !== current.distanceM) round.distance_m = next.distanceM;
      if (next.targetType !== current.targetType) round.target_type = next.targetType;
      if (next.endSize !== current.endSize) round.end_size = next.endSize;
      if (next.roundSize !== current.roundSize) round.round_size = next.roundSize;
    }
    if (this.setup) this.setup = { ...next };

    // 数を小さくして溢れた、開けただけのラウンド・エンドを外し、いちばん後ろのエンドを見る
    const rounds = this.sheet.rounds;
    let trimmed = false;
    if (rounds.length > this.gameSize && this.isLastRoundBlank) {
      rounds.pop();
      trimmed = true;
    }
    const lastRound = rounds[rounds.length - 1];
    while (
      lastRound &&
      lastRound.ends.length > (lastRound.round_size ?? next.roundSize) &&
      this.blankTailEnds > 0
    ) {
      lastRound.ends.pop();
      trimmed = true;
    }
    if (trimmed) {
      this.roundIndex = rounds.length - 1;
      this.endIndex = Math.max((lastRound?.ends.length ?? 0) - 1, 0);
    }
    this.clampPosition();
    this.changed();
  }

  // ---- コメント ----

  get gameComment(): string | null {
    return this.sheet.comment;
  }

  get roundComment(): string | null {
    return this.currentRound?.comment ?? null;
  }

  get endComment(): string | null {
    return this.currentEnd?.comment ?? null;
  }

  /** ゲーム・今のラウンド・今のエンドのコメントを書く(あれば置き換える)。空白だけなら消す */
  saveComment(target: CommentTarget, body: string) {
    const text = body.trim() === "" ? null : body.trim();
    if (target === "game") this.sheet.comment = text;
    else if (target === "round" && this.currentRound) this.currentRound.comment = text;
    else if (target === "end" && this.currentEnd) this.currentEnd.comment = text;
    this.changed();
  }

  // ---- ボタンの可否 ----

  get canBackPoint(): boolean {
    return this.currentPoints.length > 0;
  }

  get canForwardPoint(): boolean {
    return this.currentUndone.length > 0 && !this.isEndFull;
  }

  get canBackEnd(): boolean {
    return this.roundIndex > 0 || this.endIndex > 0;
  }

  /**
   * 後ろにエンドがあれば進める。いちばん後ろでは、矢が空でも次を開ける(撃たなかったエンドを飛ばせる)。
   * ゲームの最後のエンドからは進めない(終了で閉じる)。
   */
  get canForwardEnd(): boolean {
    if (!this.isAtTail) return true;
    return this.ends.length < this.roundSize || this.sheet.rounds.length < this.gameSize;
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
      roundTotal: totalScore(this.ends.flatMap((end) => end.points)),
      endTotals: Array.from(
        { length: Math.max(this.roundSize, this.ends.length) },
        (_, index) => {
          const end = this.ends[index];
          return end && end.points.length > 0 ? totalScore(end.points) : null;
        },
      ),
    };
  }

  // ---- ラウンド・エンドを開く ----

  /**
   * 次のラウンドを開く(ラウンドとその最初のエンド)。ゲームが満ちていれば何もせず false。
   * ゲームの中のラウンドは同じ設定なので、前のラウンドの値を引き継ぐ。
   */
  private openNextRound(): boolean {
    if (this.sheet.rounds.length >= this.gameSize) return false;

    const previous = this.sheet.rounds[this.sheet.rounds.length - 1];
    this.sheet.rounds.push({
      id: null,
      number: previous ? previous.number + 1 : 1,
      recorded_at: this.recordDate,
      end_size: previous?.end_size ?? this.setup?.endSize ?? DEFAULT_END_SIZE,
      round_size: previous?.round_size ?? this.setup?.roundSize ?? DEFAULT_ROUND_SIZE,
      distance_m: previous?.distance_m ?? this.setup?.distanceM ?? DEFAULT_DISTANCE_M,
      target_type: previous?.target_type ?? this.setup?.targetType ?? DEFAULT_TARGET_TYPE_ID,
      comment: null,
      ends: [],
    });
    this.roundIndex = this.sheet.rounds.length - 1;
    this.pushEnd();
    return true;
  }

  /** いちばん後ろに次のエンドを開く。ラウンドが満ちていれば次のラウンドへ。開けなければ false */
  private openNextEnd(): boolean {
    this.roundIndex = this.sheet.rounds.length - 1;
    if (this.ends.length >= this.roundSize) {
      return this.openNextRound();
    }
    this.pushEnd();
    return true;
  }

  /** 今のラウンドの末尾にエンドを足し、そこを見る */
  private pushEnd() {
    const round = this.currentRound;
    if (!round) throw new Error("ラウンドが開始されていません。");
    round.ends.push({
      id: null,
      number: round.ends.length + 1,
      recorded_at: this.recordDate,
      comment: null,
      points: [],
    });
    this.endIndex = round.ends.length - 1;
  }

  private clampPosition() {
    this.roundIndex = Math.max(Math.min(this.roundIndex, this.sheet.rounds.length - 1), 0);
    this.endIndex = Math.max(Math.min(this.endIndex, this.ends.length - 1), 0);
  }

  // ---- 矢 ----

  private pushPoint(point: UndonePoint) {
    const points = this.currentPoints;
    points.push({ id: null, number: points.length + 1, ...point });
  }

  /**
   * 矢を一本記録する。記録した時刻も持つ(あとから入力なら、その日の 0 時)。エンドが満ちていれば
   * 何もしない
   */
  addPoint(score: number, x: number | null, y: number | null) {
    if (this.isEndFull || !this.currentEnd) return;

    // 新しく撃った矢で、このエンドの履歴が分かれる
    this.undonePoints.delete(this.undoneKey);
    const backfillDate = this.backfillDate;
    const shotAt = backfillDate === null ? new Date() : startOfDate(backfillDate);
    this.pushPoint({
      score,
      x,
      y,
      recorded_at: toDateOnly(shotAt),
      shot_at: shotAt.toISOString(),
    });
    this.changed();
  }

  /** 今のエンドの最後の矢を外す。データが消えるのはここだけ。restorePoint() で入れ直せる */
  removePoint() {
    const point = this.currentPoints.pop();
    if (!point) return;
    const { score, x, y, recorded_at, shot_at } = point;
    this.undonePoints.set(this.undoneKey, [
      ...this.currentUndone,
      { score, x, y, recorded_at, shot_at },
    ]);
    this.changed();
  }

  /** removePoint() で外した矢を入れ直す */
  restorePoint() {
    if (!this.canForwardPoint) return;
    const undone = [...this.currentUndone];
    const point = undone.pop();
    if (!point) return;
    this.undonePoints.set(this.undoneKey, undone);
    this.pushPoint(point);
    this.changed();
  }

  // ---- エンドの行き来 ----

  /** 「1エンド戻る」: 前のエンドへ位置を動かす。何も消さない */
  goBackEnd() {
    if (!this.canBackEnd) return;
    if (this.endIndex > 0) {
      this.endIndex -= 1;
    } else {
      this.roundIndex -= 1;
      this.endIndex = this.ends.length - 1;
    }
    this.persist();
  }

  /** 「1エンド進む」: 後ろのエンドへ位置を動かす。いちばん後ろなら、次のエンドを新しく開く */
  goForwardEnd() {
    if (!this.canForwardEnd) return;
    if (!this.isAtTail) {
      if (this.endIndex < this.ends.length - 1) {
        this.endIndex += 1;
      } else {
        this.roundIndex += 1;
        this.endIndex = 0;
      }
      this.persist();
      return;
    }
    this.openNextEnd();
    this.changed();
  }

  // ---- 保存・終了 ----

  /**
   * API に送る形。末尾の、矢もコメントも無いエンド・ラウンドは送らない(開けただけのエンドを
   * スコア表に空の行として残さない)。手元には残すので、続けて撃てる。
   */
  private toSheetWrite(): Sheet {
    const rounds = this.sheet.rounds.map((round) => ({ ...round, ends: [...round.ends] }));
    while (rounds.length > 0) {
      const round = rounds[rounds.length - 1];
      const end = round.ends[round.ends.length - 1];
      if (end && end.points.length === 0 && !hasComment(end)) {
        round.ends.pop();
        continue;
      }
      if (!end && !hasComment(round)) {
        rounds.pop();
        continue;
      }
      break;
    }
    return { ...this.sheet, rounds };
  }

  /** 矢もコメントも無い */
  private get isEmpty(): boolean {
    return this.toSheetWrite().rounds.length === 0 && !hasComment(this.sheet);
  }

  /**
   * 保存の応答の id を、手元の同じ位置のものに当てる。送らなかった末尾は API で消えた(または
   * まだ無い)ので id を外し、次の保存で作り直させる。
   */
  private applySaved(saved: GameSheetRead) {
    this.sheet.id = saved.id;
    this.sheet.rounds.forEach((round, roundIndex) => {
      const savedRound = saved.rounds[roundIndex];
      round.id = savedRound?.id ?? null;
      round.ends.forEach((end, endIndex) => {
        const savedEnd = savedRound?.ends[endIndex];
        end.id = savedEnd?.id ?? null;
        end.points.forEach((point, pointIndex) => {
          point.id = savedEnd?.points[pointIndex]?.id ?? null;
        });
      });
    });
  }

  /**
   * 手元の記録を API に丸ごと保存する。失敗しても手元の記録はそのまま残り、もう一度保存できる。
   * 呼んでいる間は手元の記録を変えない前提(画面は保存中の操作を止める)。
   */
  async save() {
    if (this.isEmpty && this.sheet.id === null) return;
    this.applySaved(await saveGameSheet(this.toSheetWrite()));
    this.dirty = false;
    this.persist();
  }

  /**
   * 保存してキャッシュを消す。残すものが何も無ければ保存せず、保存済みのゲームなら消す
   * (矢をすべて外したゲームをスコアに空のまま残さない)。残ったゲームの id を返す。
   */
  async finish(): Promise<number | null> {
    let gameId: number | null = null;
    if (this.isEmpty) {
      if (this.sheet.id !== null) await deleteGame(this.sheet.id);
    } else {
      await this.save();
      gameId = this.sheet.id;
    }
    clearScoreSheetCache(this.sub);
    return gameId;
  }
}
