"use client";

import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ArrowMap, { hasPosition } from "@/components/ArrowMap";
import CommentField from "@/components/CommentField";
import BackButton from "@/components/BackButton";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import {
  deleteEndComment,
  deleteGame,
  deleteGameComment,
  deleteRoundComment,
  getGame,
  listEnds,
  listGameComments,
  listPoints,
  listRounds,
  saveEndComment,
  saveGameComment,
  saveRoundComment,
  toErrorDetails,
  type EndRead,
  type ErrorDetails,
  type GameComments,
  type PointRead,
  type RoundRead,
} from "@/lib/api";
import { countRings, scoreToStr, totalScore } from "@/lib/score/scoreFunctions";
import { DEFAULT_END_SIZE } from "@/lib/score/scoreConfig";
import { ScoreManager } from "@/lib/score/scoreManager";
import { useOnResume } from "@/hooks/useOnResume";
import { useT } from "@/lib/text";
import { useRunOnce } from "@/lib/useRunOnce";

/** 画面に出すコメントの文。ラウンド・エンドは id ごと */
type CommentTexts = {
  game: string | null;
  rounds: Record<number, string>;
  ends: Record<number, string>;
};

const NO_COMMENTS: CommentTexts = { game: null, rounds: {}, ends: {} };

function toCommentTexts(comments: GameComments): CommentTexts {
  return {
    game: comments.game?.body ?? null,
    rounds: Object.fromEntries(comments.rounds.map((c) => [c.round_id, c.body])),
    ends: Object.fromEntries(comments.ends.map((c) => [c.end_id, c.body])),
  };
}

function withBody(bodies: Record<number, string>, id: number, body: string | null) {
  const next = { ...bodies };
  if (body === null) delete next[id];
  else next[id] = body;
  return next;
}

/** ラウンドの一エンドと、そこに記録した矢。 */
type ViewEnd = {
  end: EndRead;
  points: Array<PointRead>;
};

/** 点数表に描くゲームの一ラウンド。 */
type ViewRound = {
  round: RoundRead;
  ends: Array<ViewEnd>;
};

export default function Page() {
  const T = useT();
  return (
    <Suspense
      fallback={
        <div className="page">
          <p className="status empty">{T.loading}</p>
        </div>
      }
    >
      <ScoreViewContent />
    </Suspense>
  );
}

function ScoreViewContent() {
  const T = useT();
  const [gameId, setGameId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<Array<ViewRound> | null>(null);
  const [comments, setComments] = useState<CommentTexts>(NO_COMMENTS);
  // コメントの書き込みは置き場所(ゲーム・ラウンド・エンド)ごとに順に流す。続けて書き換えたときに、
  // 古い書き込みが後から着いて新しい文を上書きしないように
  const commentWrites = useRef(new Map<string, Promise<void>>());
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 画面に戻ったときの読み直しは、前の読み込みが終わるのを待たずに始める(裏に回る前の読み込みが
  // 止まったまま返らないことがある)。重なったら、いちばん後に始めた読み込みの結果だけを使う
  const loadSeq = useRef(0);
  const searchParams = useSearchParams();
  const router = useRouter();

  async function loadRound(round: RoundRead): Promise<ViewRound> {
    const ends = await listEnds(round.id);
    return {
      round,
      ends: await Promise.all(
        ends.map(async (end) => ({ end, points: await listPoints(end.id) })),
      ),
    };
  }

  async function loadGame() {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const requestedId = searchParams.get("gameId");
      if (!requestedId) {
        throw new Error(T.profile.scoreView.noGame);
      }
      const game = await getGame(Number(requestedId));
      const [loadedRounds, loadedComments] = await Promise.all([
        listRounds(game.id).then((list) => Promise.all(list.map(loadRound))),
        listGameComments(game.id),
      ]);
      if (seq !== loadSeq.current) return;
      setGameId(game.id);
      setRounds(loadedRounds);
      setComments(toCommentTexts(loadedComments));
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(toErrorDetails(e));
    }
  }
  const { runOnMount, run: retryLoadGame } = useRunOnce(loadGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  // 終了から来る途中で閉じた・裏に回したときは、読み込みが失敗・途中のまま、あるいは古いまま戻るので読み直す
  useOnResume(async () => {
    if (deleting) return;
    // 裏で書いているコメントが API に届いてから読む。でないと押したばかりのコメントが古い文に戻る
    await Promise.all(commentWrites.current.values());
    loadGame();
  });

  /**
   * コメントを、押した時点で画面に出し、API へは裏で書く(書き終わるまで待たせない)。空の文は消す。
   * 書けなかったときはエラーを出し、画面のコメントを API から読み直して、書けた所に戻す。
   */
  function saveCommentInBackground(
    key: string,
    previous: string | null,
    body: string,
    write: (body: string | null) => Promise<unknown>,
    show: (body: string | null) => void,
  ) {
    const next = body.length === 0 ? null : body;
    if (next === previous) return;
    setError(null);
    show(next);
    const queued = (commentWrites.current.get(key) ?? Promise.resolve())
      .then(() => write(next))
      .then(
        () => undefined,
        async (e) => {
          setError(toErrorDetails(e));
          if (gameId === null) return;
          try {
            setComments(toCommentTexts(await listGameComments(gameId)));
          } catch {
            // 読み直せなくても、エラーは出ている
          }
        },
      );
    commentWrites.current.set(key, queued);
  }

  async function onSaveGameComment(body: string) {
    if (gameId === null) return;
    saveCommentInBackground(
      "game",
      comments.game,
      body,
      (next) => (next === null ? deleteGameComment(gameId) : saveGameComment(gameId, next)),
      (next) => setComments((current) => ({ ...current, game: next })),
    );
  }

  async function onSaveRoundComment(roundId: number, body: string) {
    saveCommentInBackground(
      `round:${roundId}`,
      comments.rounds[roundId] ?? null,
      body,
      (next) => (next === null ? deleteRoundComment(roundId) : saveRoundComment(roundId, next)),
      (next) =>
        setComments((current) => ({ ...current, rounds: withBody(current.rounds, roundId, next) })),
    );
  }

  async function onSaveEndComment(endId: number, body: string) {
    saveCommentInBackground(
      `end:${endId}`,
      comments.ends[endId] ?? null,
      body,
      (next) => (next === null ? deleteEndComment(endId) : saveEndComment(endId, next)),
      (next) => setComments((current) => ({ ...current, ends: withBody(current.ends, endId, next) })),
    );
  }

  // 入力の画面は手元のキャッシュから開く。ここで API から丸ごと読んでキャッシュを作り直し、
  // いちばん最後のエンドに戻る
  async function editGame() {
    if (gameId === null) return;
    if (ScoreManager.hasUnsavedCache() && !window.confirm(T.profile.scoreView.discardUnsaved)) return;
    setError(null);
    try {
      // 裏で書いているコメントが API に届いてから読む。でないと編集の保存で、そのコメントを消してしまう
      await Promise.all(commentWrites.current.values());
      await ScoreManager.startEditing(gameId);
      router.push("/game/score-card");
    } catch (e) {
      setError(toErrorDetails(e));
    }
  }

  async function onDeleteGame() {
    if (gameId === null) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteGame(gameId);
      router.push("/score-log");
    } catch (e) {
      setError(toErrorDetails(e));
      setConfirmingDelete(false);
      setDeleting(false);
    }
  }

  function endComment(endId: number): string | null {
    return comments.ends[endId] ?? null;
  }

  function roundComment(roundId: number): string | null {
    return comments.rounds[roundId] ?? null;
  }

  return (
    <div className="page wide">
      <PageHeader title={T.profile.scoreView.title} />
      {error && <ApiErrorAlert error={error} />}
      {error && rounds === null && (
        <button
          type="button"
          className="primary"
          onClick={() => retryLoadGame()}
        >
          {T.retry}
        </button>
      )}
      {rounds === null ? (
        !error && <p className="status empty">{T.loading}</p>
      ) : (
        <>
          {rounds.length === 0 && (
            <p className="status empty">{T.profile.scoreView.noScores}</p>
          )}
          {rounds.map((viewRound) => (
            <RoundSheet
              key={viewRound.round.id}
              viewRound={viewRound}
              roundComment={roundComment(viewRound.round.id)}
              endComment={endComment}
              onSaveRoundComment={onSaveRoundComment}
              onSaveEndComment={onSaveEndComment}
            />
          ))}
          {rounds.length > 0 && (
            <GameSummary
              rounds={rounds}
              comment={comments.game}
              onSaveComment={onSaveGameComment}
              onEdit={editGame}
            />
          )}
          <button
            type="button"
            className="DeleteGameButton danger block"
            onClick={() => setConfirmingDelete(true)}
          >
            {T.profile.scoreView.deleteGame}
          </button>
        </>
      )}
      {confirmingDelete && (
        <Modal
          title={T.profile.scoreView.deleteConfirmTitle}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="danger"
                disabled={deleting}
                onClick={onDeleteGame}
              >
                {T.delete}
              </button>
            </>
          }
        >
          <p>{T.profile.scoreView.deleteConfirm}</p>
        </Modal>
      )}
      <BackButton />
    </div>
  );
}

/** ゲーム全体の合計点・X・10・M の本数とコメント、的の集計、編集に戻るボタン。それぞれ別の枠 */
function GameSummary({
  rounds,
  comment,
  onSaveComment,
  onEdit,
}: {
  rounds: Array<ViewRound>;
  comment: string | null;
  onSaveComment: (body: string) => Promise<void>;
  onEdit: () => void;
}) {
  const T = useT();
  const points = rounds.flatMap((viewRound) =>
    viewRound.ends.flatMap((viewEnd) => viewEnd.points),
  );
  const { x, ten, miss } = countRings(points);
  const targetType = rounds[0].round.target_type;
  const items = [
    { label: T.profile.scoreView.gameTotal, value: totalScore(points) },
    { label: T.profile.scoreView.countX, value: x },
    { label: T.profile.scoreView.countTen, value: ten },
    { label: T.profile.scoreView.countMiss, value: miss },
  ];

  return (
    <>
      <div className="GameComment GameSummary panel view-comment-block">
        <div className="view-summary">
          {items.map((item) => (
            <div key={item.label}>
              <div className="muted small">{item.label}</div>
              <div className="view-summary-value">{item.value}</div>
            </div>
          ))}
          <CommentField
            iconOnly
            title={T.profile.scoreView.gameTitle}
            body={comment}
            onSave={onSaveComment}
          />
        </div>
        {comment && <p className="CommentText view-comment-text">{comment}</p>}
      </div>
      {points.some(hasPosition) && (
        <div className="ArrowMapPanel panel">
          <ArrowMap points={points} targetType={targetType} />
        </div>
      )}
      <button type="button" className="EditGameButton block" onClick={onEdit}>
        {T.profile.scoreView.edit}
      </button>
    </>
  );
}

type RoundSheetProps = {
  viewRound: ViewRound;
  roundComment: string | null;
  endComment: (endId: number) => string | null;
  onSaveRoundComment: (roundId: number, body: string) => Promise<void>;
  onSaveEndComment: (endId: number, body: string) => Promise<void>;
};

function RoundSheet(props: RoundSheetProps) {
  const T = useT();
  const { round, ends } = props.viewRound;
  // 取り込んだラウンドはアプリの既定と違う矢数のことがあるので、列は定数でなくラウンドに合わせる
  const endSize = round.end_size ?? DEFAULT_END_SIZE;

  let roundTotal = 0;
  const rows = ends.map((viewEnd) => {
    const endTotal = totalScore(viewEnd.points);
    roundTotal += endTotal;
    return { ...viewEnd, endTotal, runningTotal: roundTotal };
  });

  return (
    <section className="panel stack tight">
      <div className="view-comment view-round-head">
        <div>
          <div className="view-round-title">
            {T.profile.scoreView.round(round.number)}
          </div>
          <div className="muted small">
            {T.profile.scoreView.date(round.recorded_at)}
          </div>
        </div>
        <CommentField
          iconOnly
          title={T.profile.scoreView.roundTitle(round.number)}
          body={props.roundComment}
          onSave={(body) => props.onSaveRoundComment(round.id, body)}
        />
      </div>
      {props.roundComment && (
        <p className="RoundComment CommentText view-comment-text">
          {props.roundComment}
        </p>
      )}

      <div className="view-sheet-scroll">
        <table className="list view-sheet">
          <thead>
            <tr>
              <th className="end-col" />
              {Array.from({ length: endSize }, (_, index) => index + 1).map(
                (arrowNumber) => (
                  <th key={arrowNumber}>{arrowNumber}</th>
                ),
              )}
              {/* 合計の列は幅を決めておき、コメントの列に押されて潰れないようにする */}
              <th className="sum-col">{T.profile.scoreView.subtotal}</th>
              <th className="sum-col">{T.profile.scoreView.total}</th>
              <th className="icon-col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const comment = props.endComment(row.end.id);
              return (
                <Fragment key={row.end.id}>
                  <tr>
                    <td className="end-col">{row.end.number}</td>
                    {Array.from({ length: endSize }, (_, index) => (
                      <td key={`arrow-${index}`}>
                        {row.points[index]
                          ? scoreToStr(row.points[index].score)
                          : T.none}
                      </td>
                    ))}
                    <td>{row.endTotal}</td>
                    <td>{row.runningTotal}</td>
                    <td className="icon-col">
                      <CommentField
                        iconOnly
                        title={T.profile.scoreView.endTitle(row.end.number)}
                        body={comment}
                        onSave={(body) =>
                          props.onSaveEndComment(row.end.id, body)
                        }
                      />
                    </td>
                  </tr>
                  {comment && (
                    <tr className="comment-row">
                      <td colSpan={endSize + 4}>
                        <span className="CommentText">{comment}</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
