"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import CommentField from "@/components/CommentField";
import PageHeader from "@/components/PageHeader";
import {
  deleteEndComment,
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
import { scoreToStr, totalScore } from "@/lib/score/scoreFunctions";
import { DEFAULT_END_SIZE } from "@/lib/score/scoreConfig";
import { loadGameId } from "@/lib/storage";
import { T } from "@/lib/text";
import { useRunOnce } from "@/lib/useRunOnce";

const NO_COMMENTS: GameComments = { game: null, rounds: [], ends: [] };

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
  const [gameId, setGameId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<Array<ViewRound> | null>(null);
  const [comments, setComments] = useState<GameComments>(NO_COMMENTS);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const searchParams = useSearchParams();

  async function loadRound(round: RoundRead): Promise<ViewRound> {
    const ends = await listEnds(round.id);
    return {
      round,
      ends: await Promise.all(
        ends.map(async (end) => ({ end, points: await listPoints(end.id) }))
      ),
    };
  }

  async function loadGame() {
    setError(null);
    try {
      const requestedId = searchParams.get("gameId") ?? loadGameId();
      if (!requestedId) {
        throw new Error(T.profile.scoreView.noGame);
      }
      const game = await getGame(Number(requestedId));
      const [loadedRounds, loadedComments] = await Promise.all([
        listRounds(game.id).then((list) => Promise.all(list.map(loadRound))),
        listGameComments(game.id),
      ]);
      setGameId(game.id);
      setRounds(loadedRounds);
      setComments(loadedComments);
    } catch (e) {
      setError(toErrorDetails(e));
    }
  }
  const { runOnMount, run: retryLoadGame } = useRunOnce(loadGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  // 空の文字はコメントを消し、それ以外はゲーム・ラウンド・エンドに保存済みのものを置き換える。
  // 失敗は投げ直し、書けなかったのに編集のモーダルが閉じて文字が消えないようにする
  async function saveComment(save: () => Promise<void>) {
    setError(null);
    try {
      await save();
    } catch (e) {
      setError(toErrorDetails(e));
      throw e;
    }
  }

  async function onSaveGameComment(body: string) {
    if (gameId === null) return;
    await saveComment(async () => {
      if (body.length === 0) {
        if (comments.game === null) return;
        await deleteGameComment(gameId);
        setComments((current) => ({ ...current, game: null }));
        return;
      }
      const saved = await saveGameComment(gameId, body);
      setComments((current) => ({ ...current, game: saved }));
    });
  }

  async function onSaveRoundComment(roundId: number, body: string) {
    await saveComment(async () => {
      const without = comments.rounds.filter((c) => c.round_id !== roundId);
      if (body.length === 0) {
        if (without.length === comments.rounds.length) return;
        await deleteRoundComment(roundId);
        setComments((current) => ({
          ...current,
          rounds: current.rounds.filter((c) => c.round_id !== roundId),
        }));
        return;
      }
      const saved = await saveRoundComment(roundId, body);
      setComments((current) => ({
        ...current,
        rounds: [...current.rounds.filter((c) => c.round_id !== roundId), saved],
      }));
    });
  }

  async function onSaveEndComment(endId: number, body: string) {
    await saveComment(async () => {
      const without = comments.ends.filter((c) => c.end_id !== endId);
      if (body.length === 0) {
        if (without.length === comments.ends.length) return;
        await deleteEndComment(endId);
        setComments((current) => ({
          ...current,
          ends: current.ends.filter((c) => c.end_id !== endId),
        }));
        return;
      }
      const saved = await saveEndComment(endId, body);
      setComments((current) => ({
        ...current,
        ends: [...current.ends.filter((c) => c.end_id !== endId), saved],
      }));
    });
  }

  function endComment(endId: number): string | null {
    return comments.ends.find((c) => c.end_id === endId)?.body ?? null;
  }

  function roundComment(roundId: number): string | null {
    return comments.rounds.find((c) => c.round_id === roundId)?.body ?? null;
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
          <div className="GameComment panel view-comment">
            <span className="section-label">{T.profile.scoreView.gameComment}</span>
            <CommentField
              title={T.profile.scoreView.gameTitle}
              body={comments.game?.body ?? null}
              emptyText={T.profile.scoreView.addComment}
              onSave={onSaveGameComment}
            />
          </div>
          {rounds.length === 0 && <p className="status empty">{T.profile.scoreView.noScores}</p>}
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
        </>
      )}
    </div>
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
      <div>
        <div className="view-round-title">{T.profile.scoreView.round(round.number)}</div>
        <div className="muted small">{T.profile.scoreView.date(round.recorded_at)}</div>
      </div>
      <div className="RoundComment view-comment">
        <span className="section-label small">{T.profile.scoreView.roundComment}</span>
        <CommentField
          title={T.profile.scoreView.roundTitle(round.number)}
          body={props.roundComment}
          emptyText={T.profile.scoreView.addComment}
          onSave={(body) => props.onSaveRoundComment(round.id, body)}
        />
      </div>

      <div className="view-sheet-scroll">
        <table className="list view-sheet">
          <thead>
            <tr>
              <th className="end-col" />
              {Array.from({ length: endSize }, (_, index) => index + 1).map((arrowNumber) => (
                <th key={arrowNumber}>{arrowNumber}</th>
              ))}
              {/* 合計の列は幅を決めておき、コメントの列に押されて潰れないようにする */}
              <th className="sum-col">{T.profile.scoreView.subtotal}</th>
              <th className="sum-col">{T.profile.scoreView.total}</th>
              {/* スマホではコメントの列を置く幅が無いので、表の下にまとめて出す(.view-end-comments) */}
              <th className="comment-col">{T.profile.scoreView.comment}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.end.id}>
                <td className="end-col">{row.end.number}</td>
                {Array.from({ length: endSize }, (_, index) => (
                  <td key={`arrow-${index}`}>{row.points[index] ? scoreToStr(row.points[index].score) : T.none}</td>
                ))}
                <td>{row.endTotal}</td>
                <td>{row.runningTotal}</td>
                <td className="comment-col">
                  <CommentField
                    title={T.profile.scoreView.endTitle(row.end.number)}
                    body={props.endComment(row.end.id)}
                    emptyText={T.profile.scoreView.addComment}
                    onSave={(body) => props.onSaveEndComment(row.end.id, body)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="EndComments view-end-comments">
        {rows.map((row) => (
          <div
            key={row.end.id}
            className="view-comment"
          >
            <span className="section-label small end-label">{T.profile.scoreView.endTitle(row.end.number)}</span>
            <CommentField
              title={T.profile.scoreView.endTitle(row.end.number)}
              body={props.endComment(row.end.id)}
              emptyText={T.profile.scoreView.addComment}
              onSave={(body) => props.onSaveEndComment(row.end.id, body)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
