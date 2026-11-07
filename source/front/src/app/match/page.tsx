"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import MatchShareModal from "@/components/MatchShareModal";
import MatchStandingView from "@/components/MatchStandingView";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getMatch } from "@/lib/api";
import { MATCH_LIST_PATH } from "@/lib/destinations";
import {
  MATCH_ID_PARAM,
  matchRankingPath,
  matchSetupPath,
  matchTitle,
  parseMatchId,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

/**
 * 一つの試合の画面。概要・参加・QR と、作った人・参加した人には結果(順位と集計)を出す。
 * 共有の URL・QR はここを指す
 */
export default function Page() {
  const T = useT();
  const router = useRouter();
  const params = useQueryParams();
  const matchId = params ? parseMatchId(params.get(MATCH_ID_PARAM)) : undefined;
  // 上げると読み直す。画面に戻ったとき(ほかの人の記録が増えていく)と、作った人が直したとき
  const [reloadKey, setReloadKey] = useState(0);
  useOnResume(() => setReloadKey((key) => key + 1));
  const [sharing, setSharing] = useState(false);

  // 試合の id の無い・読めない URL は、試合を探す入口の一覧へ
  useEffect(() => {
    if (matchId === null) router.replace(MATCH_LIST_PATH);
  }, [matchId, router]);

  const loaded = useLoad(
    () => (matchId ? getMatch(matchId) : Promise.resolve(null)),
    [matchId, reloadKey],
  );
  const match = loaded.data && loaded.data.id === matchId ? loaded.data : null;

  return (
    <div className="page">
      <PageHeader title={match ? matchTitle(T, match) : T.match.title} />
      {loaded.error?.status === 404 && (
        <div className="stack tight">
          <p className="MatchNotFound status error">{T.match.detail.notFound}</p>
          <button
            type="button"
            className="block"
            onClick={() => router.push(MATCH_LIST_PATH)}
          >
            {T.match.detail.toList}
          </button>
        </div>
      )}
      {loaded.error && loaded.error.status !== 404 && <ApiErrorAlert error={loaded.error} />}
      {loaded.loading && !match && matchId && <p className="status empty">{T.loading}</p>}

      {match && (
        <>
          <MatchSummary
            match={match}
            titleInHeader
            onUpdated={() => setReloadKey((key) => key + 1)}
            onDeleted={() => router.push(MATCH_LIST_PATH)}
          />
          <button
            type="button"
            className="MatchJoinStart primary large block"
            onClick={() => router.push(matchSetupPath(match.id))}
          >
            {T.match.detail.join}
          </button>
          <div className="action-row">
            <button
              type="button"
              className="MatchShareOpen grow"
              onClick={() => setSharing(true)}
            >
              {T.match.share.open}
            </button>
            {match.result && (
              <button
                type="button"
                className="MatchRankingOpen grow"
                onClick={() => router.push(matchRankingPath(match.id))}
              >
                {T.match.result.ranking}
              </button>
            )}
          </div>
          <div className="section-label">{T.match.result.title}</div>
          {match.result ? (
            <MatchStandingView standing={match.result} />
          ) : (
            <p className="MatchResultHidden muted small">{T.match.detail.resultHidden}</p>
          )}
          {sharing && (
            <MatchShareModal
              matchId={match.id}
              onClose={() => setSharing(false)}
            />
          )}
        </>
      )}
      <BackButton />
    </div>
  );
}
