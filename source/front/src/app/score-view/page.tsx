"use client";

import AuthGate from "@/components/auth/AuthGate";
import { JSX, Suspense, useEffect, useState } from "react";
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
import { scoreToStr, totalScore } from "@/modules/data/score/scoreFunctions";
import { DEFAULT_END_SIZE } from "@/modules/data/score/scoreConfig";
import { loadGameId } from "@/modules/functions/localStorage";
import { useSearchParams } from "next/navigation";
import Header from "@/components/templates/common/header";
import { Button } from "@mui/material";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import CommentField from "@/components/templates/common/CommentField";
import { useRunOnce } from "@/hooks/useRunOnce";

const NO_COMMENTS: GameComments = { game: null, rounds: [], ends: [] };

/** One end of a round with the arrows recorded in it. */
interface ViewEnd {
  end: EndRead;
  points: Array<PointRead>;
}

/** One round of the game as the sheet draws it. */
interface ViewRound {
  round: RoundRead;
  ends: Array<ViewEnd>;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20 text-sm text-slate-400">
          読み込み中...
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
        throw new Error("表示するスコアが指定されていません。");
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

  // An empty text removes the comment; anything else replaces whatever is
  // stored for that game/round/end. The failure is re-thrown so the editor
  // keeps the text instead of closing over a write that never landed.
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
    <AuthGate>
      <div className="flex flex-col min-h-screen">
        <Header pageName="スコア" />
        <div className="py-4">
          {error && (
            <div className="flex flex-col items-center gap-4 px-6 pb-4">
              <ApiErrorAlert error={error} className="w-full max-w-xl" />
              {rounds === null && (
                <Button variant="contained" onClick={() => retryLoadGame()}>
                  再試行
                </Button>
              )}
            </div>
          )}
          {rounds === null ? (
            !error && (
              <div className="flex justify-center py-20 text-sm text-slate-400">
                読み込み中...
              </div>
            )
          ) : (
            <div className="flex flex-col items-center">
              <div className="GameComment p-4 flex w-[92%] max-w-xl md:max-w-3xl mx-auto mb-4 items-center gap-2 rounded-2xl bg-white/85 backdrop-blur-sm shadow-sm">
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  ゲームのコメント
                </span>
                <CommentField
                  title="ゲーム"
                  body={comments.game?.body ?? null}
                  emptyText="コメントを追加"
                  onSave={onSaveGameComment}
                  className="flex-1"
                />
              </div>
              {rounds.length === 0 && (
                <div className="flex justify-center py-20 text-sm text-slate-400">
                  この記録にはまだスコアがありません
                </div>
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
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

interface RoundSheetProps {
  viewRound: ViewRound;
  roundComment: string | null;
  endComment: (endId: number) => string | null;
  onSaveRoundComment: (roundId: number, body: string) => Promise<void>;
  onSaveEndComment: (endId: number, body: string) => Promise<void>;
}

function RoundSheet(props: RoundSheetProps) {
  const { round, ends } = props.viewRound;
  // An imported round can hold a different arrows-per-end than the app's
  // own default, so the columns follow the round rather than a constant.
  const endSize = round.end_size ?? DEFAULT_END_SIZE;

  let roundTotal = 0;
  const rows = ends.map((viewEnd) => {
    const endTotal = totalScore(viewEnd.points);
    roundTotal += endTotal;
    return { ...viewEnd, endTotal, runningTotal: roundTotal };
  });

  return (
    <div className="p-4 flex flex-col w-[92%] max-w-xl md:max-w-3xl mx-auto mb-4 rounded-2xl bg-white/85 backdrop-blur-sm shadow-sm">
      <div className="font-semibold text-slate-700">ラウンド：{round.number}</div>
      <div className="text-sm text-slate-500 mb-2">日付：{round.recorded_at}</div>
      <div className="RoundComment mb-2 flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-slate-500">
          ラウンドのコメント
        </span>
        <CommentField
          title={`ラウンド ${round.number}`}
          body={props.roundComment}
          emptyText="コメントを追加"
          onSave={(body) => props.onSaveRoundComment(round.id, body)}
          className="flex-1"
        />
      </div>

      <table className="table-fixed border-collapse border border-gray-300 mx-auto">
        <thead>
          <tr className="h-15">
            <Th className="w-10" />
            {Array.from({ length: endSize }, (_, index) => index + 1).map(
              (arrowNumber) => (
                <Th key={arrowNumber} v={arrowNumber} className="w-10" />
              )
            )}
            {/* Fixed so the comment column below can't squeeze the
                totals out of their own cells. */}
            <Th v="小計" className="w-14" />
            <Th v="合計" className="w-14" />
            {/* On a phone the sheet has no room for a comment column, so the
                notes are gathered under the table instead. */}
            <Th v="コメント" className="hidden md:table-cell w-56" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.end.id}>
              <Td v={row.end.number} className="font-bold h-10 w-15" />
              {Array.from({ length: endSize }, (_, index) => (
                <Td
                  key={`arrow-${index}`}
                  v={row.points[index] ? scoreToStr(row.points[index].score) : "-"}
                />
              ))}
              <Td v={row.endTotal} />
              <Td v={row.runningTotal} />
              <Td
                className="hidden md:table-cell px-1"
                v={
                  <CommentField
                    title={`END ${row.end.number}`}
                    body={props.endComment(row.end.id)}
                    emptyText="コメントを追加"
                    onSave={(body) => props.onSaveEndComment(row.end.id, body)}
                  />
                }
              />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="EndComments mt-3 flex flex-col md:hidden">
        {rows.map((row) => (
          <div key={row.end.id} className="flex items-center gap-1">
            <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">
              END {row.end.number}
            </span>
            <CommentField
              title={`END ${row.end.number}`}
              body={props.endComment(row.end.id)}
              emptyText="コメントを追加"
              onSave={(body) => props.onSaveEndComment(row.end.id, body)}
              className="flex-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ThProps {
  v?: string | number | JSX.Element;
  className?: string;
}
const Th = (p: ThProps) => {
  let className = "border border-gray-300 text-center";
  if (p.className) {
    className += ` ${p.className}`;
  }
  return <th className={className}>{p.v}</th>;
};

interface TdProps {
  v?: string | number | JSX.Element;
  className?: string;
}
const Td = (p: TdProps) => {
  let className = "border border-gray-300 text-center";
  if (p.className) {
    className += ` ${p.className}`;
  }
  return <td className={className}>{p.v}</td>;
};
