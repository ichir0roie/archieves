"use client";

import AuthGate from "@/components/auth/AuthGate";
import { JSX, Suspense, useEffect, useState } from "react";
import {
  getGame,
  listEnds,
  listPoints,
  listRounds,
  toErrorDetails,
  type ErrorDetails,
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
import { useRunOnce } from "@/hooks/useRunOnce";

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
  const [mainElement, setMainElement] = useState<JSX.Element | null>(null);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const searchParams = useSearchParams();

  async function loadGame() {
    setError(null);
    try {
      const gameId = searchParams.get("gameId") ?? loadGameId();
      if (!gameId) {
        throw new Error("表示するスコアが指定されていません。");
      }
      const game = await getGame(Number(gameId));
      setMainElement(await loadMainElement(game.id));
    } catch (e) {
      setError(toErrorDetails(e));
    }
  }
  const { runOnMount, run: retryLoadGame } = useRunOnce(loadGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  function getPointElements(points: Array<PointRead>, endSize: number) {
    const resElements = new Array<JSX.Element>();
    for (let i = 0; i < endSize; i++) {
      const point = points[i];
      resElements.push(
        <Td key={`arrow-${i}`} v={point ? scoreToStr(point.score) : "-"} />
      );
    }
    return resElements;
  }

  async function getEndElements(round: RoundRead, endSize: number) {
    const ends = await listEnds(round.id);
    const resp = new Array<JSX.Element>();
    let roundTotal = 0;
    for (const end of ends) {
      const points = await listPoints(end.id);
      const endTotal = totalScore(points);
      roundTotal += endTotal;

      resp.push(
        <tr key={end.id}>
          <Td v={end.number} className="font-bold h-10 w-15" />
          {getPointElements(points, endSize)}
          <Td key="end-total" v={endTotal} />
          <Td key="round-total" v={roundTotal} />
        </tr>
      );
    }

    return resp;
  }

  async function getRoundElements(gameId: number) {
    const rounds = await listRounds(gameId);
    const resp = new Array<JSX.Element>();
    for (const round of rounds) {
      // An imported round can hold a different arrows-per-end than the app's
      // own default, so the columns follow the round rather than a constant.
      const endSize = round.end_size ?? DEFAULT_END_SIZE;
      const endElements = await getEndElements(round, endSize);
      resp.push(
        <div
          key={round.id}
          className="p-4 flex flex-col w-[92%] max-w-xl mx-auto mb-4 rounded-2xl bg-white/85 backdrop-blur-sm shadow-sm"
        >
          <div className="font-semibold text-slate-700">
            ラウンド：{round.number}
          </div>
          <div className="text-sm text-slate-500 mb-2">
            日付：
            {round.recorded_at}
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
                <Th v="小計" />
                <Th v="合計" />
              </tr>
            </thead>
            <tbody>{endElements}</tbody>
          </table>
        </div>
      );
    }
    return resp;
  }

  async function loadMainElement(gameId: number) {
    const roundElements = await getRoundElements(gameId);
    if (roundElements.length === 0) {
      return (
        <div className="flex justify-center py-20 text-sm text-slate-400">
          この記録にはまだスコアがありません
        </div>
      );
    }
    return <div className="flex flex-col items-center">{roundElements}</div>;
  }

  return (
    <AuthGate>
      <div className="flex flex-col min-h-screen">
        <Header pageName="スコア" />
        <div className="py-4">
          {error ? (
            <div className="flex flex-col items-center gap-4 py-20 px-6">
              <ApiErrorAlert error={error} className="w-full max-w-xl" />
              <Button variant="contained" onClick={() => retryLoadGame()}>
                再試行
              </Button>
            </div>
          ) : (
            mainElement ?? (
              <div className="flex justify-center py-20 text-sm text-slate-400">
                読み込み中...
              </div>
            )
          )}
        </div>
      </div>
    </AuthGate>
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
