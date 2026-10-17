"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AiCommentPanel from "@/components/AiCommentPanel";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ArrowMap, { hasPosition } from "@/components/ArrowMap";
import CommentField from "@/components/CommentField";
import BackButton from "@/components/BackButton";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import RoundScoreSheet from "@/components/RoundScoreSheet";
import {
  deleteEndComment,
  deleteGame,
  deleteGameAiComment,
  deleteGameComment,
  deleteRoundComment,
  getGameSheet,
  listGameComments,
  saveEndComment,
  saveGameComment,
  saveRoundComment,
  toErrorDetails,
  type EndSheetRead,
  type ErrorDetails,
  type GameComments,
  type GameSheetRead,
  type PointRead,
  type RoundSheetRead,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH } from "@/lib/destinations";
import { countRings, totalScore } from "@/lib/score/scoreFunctions";
import { ScoreManager } from "@/lib/score/scoreManager";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { useT } from "@/lib/text";

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

function sheetCommentTexts(sheet: GameSheetRead): CommentTexts {
  const rounds: Record<number, string> = {};
  const ends: Record<number, string> = {};
  for (const round of sheet.rounds) {
    if (round.comment !== null) rounds[round.id] = round.comment;
    for (const end of round.ends) {
      if (end.comment !== null) ends[end.id] = end.comment;
    }
  }
  return { game: sheet.comment, rounds, ends };
}

function withBody(bodies: Record<number, string>, id: number, body: string | null) {
  const next = { ...bodies };
  if (body === null) delete next[id];
  else next[id] = body;
  return next;
}

/** ラウンドの一エンドと、そこに記録した矢。 */
type ViewEnd = {
  end: EndSheetRead;
  points: Array<PointRead>;
};

/** 点数表に描くゲームの一ラウンド。 */
type ViewRound = {
  round: RoundSheetRead;
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
  // コメントの書き込みは置き場所(ゲーム・ラウンド・エンド)ごとに順に流す。続けて書き換えたときに、
  // 古い書き込みが後から着いて新しい文を上書きしないように
  const commentWrites = useRef(new Map<string, Promise<void>>());
  // 画面での操作(コメント・編集・削除)の失敗。読み込みの失敗は loaded.error
  const [actionError, setActionError] = useState<ErrorDetails | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAiComment, setDeletingAiComment] = useState(false);
  // 上げると読み直す(画面に戻ったとき・再試行)
  const [reloadKey, setReloadKey] = useState(0);
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("gameId");
  const router = useRouter();

  const loaded = useLoad(async () => {
    if (!requestedId) {
      throw new Error(T.profile.scoreView.noGame);
    }
    // 裏で書いているコメントが API に届いてから読む。でないと押したばかりのコメントが古い文に戻る
    await Promise.all(commentWrites.current.values());
    // ラウンド・エンド・矢・コメントを一度の要求で読む(ラウンドやエンドごとに呼ぶと、矢の多いゲームで要求が並ぶ)
    const sheet = await getGameSheet(Number(requestedId));
    return {
      gameId: sheet.id,
      aiComment: sheet.ai_comment,
      rounds: sheet.rounds.map((round) => ({
        round,
        ends: round.ends.map((end) => ({
          end,
          points: end.points,
        })),
      })),
      comments: sheetCommentTexts(sheet),
    };
  }, [requestedId, reloadKey]);
  const gameId = loaded.data?.gameId ?? null;
  const rounds = loaded.data?.rounds ?? null;
  const error = actionError ?? loaded.error;

  // コメントは押した時点で画面に出す(API には裏で書く)ので、読んだものとは別に持つ。読み直したら読んだものに戻す
  const [comments, setComments] = useState<CommentTexts>(NO_COMMENTS);
  const [commentsLoadedFrom, setCommentsLoadedFrom] = useState(loaded.data);
  if (commentsLoadedFrom !== loaded.data) {
    setCommentsLoadedFrom(loaded.data);
    setComments(loaded.data?.comments ?? NO_COMMENTS);
  }

  function reload() {
    setActionError(null);
    setReloadKey((key) => key + 1);
  }

  // 終了から来る途中で閉じた・裏に回したときは、読み込みが失敗・途中のまま、あるいは古いまま戻るので読み直す。
  // 前の読み込みは待たない(裏に回る前の読み込みが止まったまま返らないことがある)。useLoad が古い応答を捨てる
  useOnResume(() => {
    if (!deleting) reload();
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
    setActionError(null);
    show(next);
    const queued = (commentWrites.current.get(key) ?? Promise.resolve())
      .then(() => write(next))
      .then(
        () => undefined,
        async (e) => {
          setActionError(toErrorDetails(e));
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
    setActionError(null);
    try {
      const { userId } = await getCurrentUser();
      if (
        ScoreManager.hasUnsavedCache(userId) &&
        !window.confirm(T.profile.scoreView.discardUnsaved)
      ) {
        return;
      }
      // 裏で書いているコメントが API に届いてから読む。でないと編集の保存で、そのコメントを消してしまう
      await Promise.all(commentWrites.current.values());
      await ScoreManager.startEditing(userId, gameId);
      router.push(SCORE_CARD_PATH);
    } catch (e) {
      setActionError(toErrorDetails(e));
    }
  }

  async function onDeleteAiComment() {
    if (gameId === null) return;
    setActionError(null);
    setDeletingAiComment(true);
    try {
      await deleteGameAiComment(gameId);
      reload();
    } catch (e) {
      setActionError(toErrorDetails(e));
    } finally {
      setDeletingAiComment(false);
    }
  }

  async function onDeleteGame() {
    if (gameId === null) return;
    setActionError(null);
    setDeleting(true);
    try {
      await deleteGame(gameId);
      router.push("/score-log");
    } catch (e) {
      setActionError(toErrorDetails(e));
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
      {loaded.error && rounds === null && (
        <button
          type="button"
          className="primary"
          onClick={reload}
        >
          {T.retry}
        </button>
      )}
      {rounds === null ? (
        !loaded.error && <p className="status empty">{T.loading}</p>
      ) : (
        <>
          {rounds.length === 0 && (
            <p className="status empty">{T.profile.scoreView.noScores}</p>
          )}
          {rounds.map((viewRound) => (
            <RoundScoreSheet
              key={viewRound.round.id}
              round={viewRound.round}
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
          {loaded.data && (
            <AiCommentPanel
              aiComment={loaded.data.aiComment}
              onDelete={onDeleteAiComment}
              deleting={deletingAiComment}
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
          <ArrowMap points={points} />
        </div>
      )}
      <button type="button" className="EditGameButton block" onClick={onEdit}>
        {T.profile.scoreView.edit}
      </button>
    </>
  );
}
