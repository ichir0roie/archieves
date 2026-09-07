"use client";

import AuthGate from "@/components/auth/AuthGate";
import { JSX, Suspense, useEffect, useState } from "react";
import {
  listEnds,
  listPoints,
  listRounds,
  toErrorDetails,
  type ErrorDetails,
  type PointRead,
  type RoundRead,
} from "@/lib/api";
import { ScoreManager } from "@/modules/data/score/scoreManager";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { scoreToInt, scoreToStr } from "@/modules/data/score/scoreFunctions";
import { DEFAULT_END_SIZE } from "@/modules/data/score/scoreConfig";
import { useSearchParams } from "next/navigation";
import Header from "@/components/templates/common/header";
import { Button } from "@mui/material";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import { useRunOnce } from "@/hooks/useRunOnce";

const setupInFlightByGameId = new Map<string, Promise<ScoreManager>>();

function setupOrResumeGame(
  gameId: string | null,
  userId: number
): Promise<ScoreManager> {
  const key = gameId ?? "";
  let inFlight = setupInFlightByGameId.get(key);
  if (!inFlight) {
    inFlight = (async () => {
      const scoreManager = new ScoreManager(gameId, userId);
      await scoreManager.setupGame();
      return scoreManager;
    })().finally(() => {
      setupInFlightByGameId.delete(key);
    });
    setupInFlightByGameId.set(key, inFlight);
  }
  return inFlight;
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
  const [mainElement, setMainElement] = useState<JSX.Element | null>(null);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const searchParams = useSearchParams();

  async function setupGame() {
    setError(null);
    try {
      const { id: userId } = await getCurrentAppUser();
      const gameId = searchParams.get("gameId");
      const scoreManager = await setupOrResumeGame(gameId, userId);

      const mainElement = await loadMainElement(scoreManager);
      setMainElement(mainElement);
    } catch (e) {
      setError(toErrorDetails(e));
    }
  }
  const { runOnMount, run: retrySetupGame } = useRunOnce(setupGame);

  useEffect(() => {
    runOnMount();
  }, [runOnMount]);

  async function getPointElements(points: Array<PointRead>, shotsPerEnd: number) {
    const resElements = new Array<JSX.Element>();
    for (let i = 0; i < shotsPerEnd; i++) {
      if (i < points.length) {
        const point = points[i];
        resElements.push(<Td key={i + 1} v={scoreToStr(point.score)} />);
      } else {
        resElements.push(<Td key={i + 1} v={"-"} />);
      }
    }
    return resElements;
  }

  async function getEndElements(round: RoundRead) {
    const ends = await listEnds(round.id);
    const resp = new Array<JSX.Element>();
    let roundTotal = 0;
    for (let i = 0; i < ends.length; i++) {
      let endTotal = 0;

      const end = ends[i];
      const points = await listPoints(end.id);

      const pointElements = await getPointElements(
        points,
        round.end_size ?? DEFAULT_END_SIZE
      );

      points.forEach((p) => {
        endTotal += scoreToInt(p.score);
      });
      roundTotal += endTotal;

      resp.push(
        <tr key={end.number}>
          <Td
            v={end.number}
            key={end.number}
            className="font-bold h-10 w-15"
          />
          {pointElements}
          <Td key={10} v={endTotal} />
          <Td key={20} v={roundTotal} />
        </tr>
      );
    }

    return resp;
  }

  async function getRoundElements(m: ScoreManager) {
    if (!m?.game) {
      throw Error("Game is not defined");
    }
    const rounds = await listRounds(m.game.id);
    const resp = new Array<JSX.Element>();
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const endElements = await getEndElements(round);
      resp.push(
        <div
          key={round.number}
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
                {[1, 2, 3, 4, 5, 6].map((roundId) => (
                  <Th key={roundId} v={roundId} className="w-10" />
                ))}
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

  async function loadMainElement(m: ScoreManager) {
    const roundElements = await getRoundElements(m);
    return <div className="flex flex-col items-center">{roundElements}</div>;
  }

  return (
    <AuthGate>
      <div className="flex flex-col min-h-screen">
        <Header pageName="スコア" showBack />
        <div className="py-4">
          {error ? (
            <div className="flex flex-col items-center gap-4 py-20 px-6">
              <ApiErrorAlert error={error} className="w-full max-w-xl" />
              <Button variant="contained" onClick={() => retrySetupGame()}>
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
