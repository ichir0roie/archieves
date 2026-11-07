"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import MatchShareModal from "@/components/MatchShareModal";
import MatchStandingView from "@/components/MatchStandingView";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import SettingsMenu from "@/components/SettingsMenu";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { useQueryParams } from "@/hooks/useQueryParams";
import { deleteMatch, getMatch } from "@/lib/api";
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
 * 一つの試合の画面。概要・参加・QR と、結果(順位と集計)を出す。
 * 共有の URL・QR はここを指す。作った人には右上の設定から削除を出す
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
  const [deleting, setDeleting] = useState(false);

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
      <PageHeader
        title={match ? matchTitle(T, match) : T.match.title}
        actions={
          match?.organized_by_me && (
            <SettingsMenu
              items={[
                {
                  label: T.match.info.deleteTitle,
                  className: "MatchDelete",
                  onSelect: () => setDeleting(true),
                },
              ]}
            />
          )
        }
      />
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
            <button
              type="button"
              className="MatchRankingOpen grow"
              onClick={() => router.push(matchRankingPath(match.id))}
            >
              {T.match.result.ranking}
            </button>
          </div>
          <div className="section-label">{T.match.result.title}</div>
          <MatchStandingView standing={match.result} />
          {sharing && (
            <MatchShareModal
              matchId={match.id}
              onClose={() => setSharing(false)}
            />
          )}
          {deleting && (
            <DeleteConfirmModal
              title={T.match.info.deleteTitle}
              message={T.match.info.deleteConfirm(matchTitle(T, match))}
              onClose={() => setDeleting(false)}
              onConfirm={async () => {
                await deleteMatch(match.id);
                router.push(MATCH_LIST_PATH);
              }}
            />
          )}
        </>
      )}
      <BackButton />
    </div>
  );
}
