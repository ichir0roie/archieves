"use client";
import PageHeader from "@/components/PageHeader";
import { loadGameId, loadInputMode } from "@/lib/storage";
import { T } from "@/lib/text";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MODE_PATH = {
  simple: "/game/simple-score-card",
  touch: "/game/score-card",
} as const;

export default function Page() {
  const router = useRouter();
  // サーバーでの描画中は localStorage を読めないので、続きがあるかは画面に載ってから分かる
  const [hasGameInProgress, setHasGameInProgress] = useState(false);

  useEffect(() => {
    setHasGameInProgress(loadGameId() !== null);
  }, []);

  function newGame() {
    router.push("/game/setup");
  }
  function continueGame() {
    router.push(MODE_PATH[loadInputMode() ?? "touch"]);
  }

  return (
    <div className="page">
      <PageHeader title={T.game.start.title} />
      <div className="panel stack tight">
        <button
          type="button"
          className="primary large block"
          onClick={newGame}
        >
          {T.game.start.newScore}
        </button>
        <button
          type="button"
          className="large block"
          disabled={!hasGameInProgress}
          onClick={continueGame}
        >
          {T.game.start.resume}
        </button>
        {!hasGameInProgress && <p className="game-note muted small">{T.game.start.noGameInProgress}</p>}
      </div>
    </div>
  );
}
