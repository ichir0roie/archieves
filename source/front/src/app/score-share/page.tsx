"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import PageHeader from "@/components/PageHeader";
import SharedGameCard from "@/components/SharedGameCard";
import { listSharedScores } from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { SCORE_SHARE_IDS_PARAM, parseShareIds } from "@/lib/scoreShare";
import { useT } from "@/lib/text";

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
      <ScoreShareContent />
    </Suspense>
  );
}

/**
 * クエリの ids のゲームを、点数表・的中の図・コメントごとに並べる。ログインしていなくても開ける。
 * 見せるかどうかは API が持ち主のスコアの公開範囲で決め、見せないゲームは返ってこない
 */
function ScoreShareContent() {
  const T = useT();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get(SCORE_SHARE_IDS_PARAM);
  const { data: games, loading, error } = useLoad(async () => {
    const ids = parseShareIds(idsParam);
    return ids.length === 0 ? null : await listSharedScores(ids);
  }, [idsParam]);

  return (
    <div className="ScoreShare page wide">
      <PageHeader title={T.profile.scoreShare.title} />
      {error && <ApiErrorAlert error={error} />}
      {loading && <p className="status empty">{T.loading}</p>}
      {!loading && !error && games === null && (
        <p className="status empty">{T.profile.scoreShare.noGames}</p>
      )}
      {!loading && games?.length === 0 && (
        <p className="status empty">{T.profile.scoreShare.empty}</p>
      )}
      {!loading && games && games.length > 0 && (
        <>
          <p className="muted small">{T.profile.scoreShare.count(games.length)}</p>
          {games.map((game) => (
            <SharedGameCard
              key={game.id}
              game={game}
            />
          ))}
        </>
      )}
    </div>
  );
}
