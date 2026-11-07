"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import MatchShare from "@/components/MatchShare";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { getMatchResult, type MatchStatistics } from "@/lib/api";
import { MATCH_ID_PARAM, matchJoinPath, matchRankingPath, parseMatchId } from "@/lib/score/match";
import { useT, type Texts } from "@/lib/text";

function formatNumber(T: Texts, value: number | null, digits = 1): string {
  if (value === null) return T.none;
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function StatisticsPanel({ statistics }: { statistics: MatchStatistics }) {
  const T = useT();
  const items = [
    {
      label: T.match.result.count,
      value: String(statistics.count),
    },
    {
      label: T.match.result.average,
      value: formatNumber(T, statistics.average),
    },
    {
      label: T.match.result.standardDeviation,
      value: formatNumber(T, statistics.standard_deviation),
    },
    {
      label: T.match.result.median,
      value: formatNumber(T, statistics.median),
    },
    {
      label: T.match.result.max,
      value: formatNumber(T, statistics.max),
    },
    {
      label: T.match.result.min,
      value: formatNumber(T, statistics.min),
    },
  ];
  return (
    <div className="MatchStatistics panel stack tight">
      <div className="section-label">{T.match.result.statistics}</div>
      <div className="match-stats">
        {items.map((item) => (
          <div key={item.label}>
            <span className="muted small">{item.label}</span>
            <span className="value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  const T = useT();
  const me = useCachedAppUser();
  // URL を読むまでは undefined。読めない id なら null
  const [matchId, setMatchId] = useState<string | null | undefined>(undefined);
  // 上げると読み直す(画面に戻ったとき)。ほかの人の記録が増えていく
  const [reloadKey, setReloadKey] = useState(0);
  useOnResume(() => setReloadKey((key) => key + 1));

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    setMatchId(parseMatchId(new URLSearchParams(window.location.search).get(MATCH_ID_PARAM)));
  }, []);

  const loaded = useLoad(
    () => (typeof matchId === "string" ? getMatchResult(matchId) : Promise.resolve(null)),
    [matchId, reloadKey],
  );
  const result = loaded.data;

  return (
    <div className="page">
      <PageHeader title={T.match.result.title} />
      {matchId === null && <p className="status error">{T.match.result.notFound}</p>}
      {loaded.error?.status === 404 && <p className="status error">{T.match.result.notFound}</p>}
      {loaded.error?.status === 403 && (
        <div className="MatchResultForbidden stack tight">
          <p className="status error">{T.match.result.forbidden}</p>
          {typeof matchId === "string" && <Link href={matchJoinPath(matchId)}>{T.match.result.join}</Link>}
        </div>
      )}
      {loaded.error && loaded.error.status !== 403 && loaded.error.status !== 404 && (
        <ApiErrorAlert error={loaded.error} />
      )}
      {loaded.loading && !result && matchId !== null && <p className="status empty">{T.loading}</p>}

      {result && (
        <>
          <MatchSummary match={result.match} />
          <div className="row">
            <Link href={matchJoinPath(result.match.id)}>{T.match.result.join}</Link>
            <Link href={matchRankingPath(result.match.id)}>{T.match.result.ranking}</Link>
          </div>
          <StatisticsPanel statistics={result.statistics} />
          <div className="section-label">{T.match.result.entries}</div>
          {result.entries.length === 0 ? (
            <p className="status empty">{T.match.result.empty}</p>
          ) : (
            <div className="MatchResultTable-scroll">
              <table className="list MatchResultTable">
                <thead>
                  <tr>
                    <th className="num">{T.match.result.rank}</th>
                    <th>{T.match.result.name}</th>
                    <th>{T.match.result.gear}</th>
                    <th className="num">{T.match.result.total}</th>
                    <th className="num">{T.match.result.ten}</th>
                    <th className="num">{T.match.result.x}</th>
                    <th className="num">{T.match.result.miss}</th>
                    <th className="num">{T.match.result.deviation}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((entry) => {
                    const mine = me !== null && entry.user.id === me.id;
                    return (
                      <tr
                        key={entry.game_id}
                        className={mine ? "MatchEntry mine" : "MatchEntry"}
                      >
                        <td className="num">{entry.rank}</td>
                        <td>
                          {mine ? (
                            <Link href={`/score-view?gameId=${entry.game_id}`}>{entry.user.name}</Link>
                          ) : entry.user.profile_visible ? (
                            <Link href={`/profile/${entry.user.id}`}>{entry.user.name}</Link>
                          ) : (
                            entry.user.name
                          )}
                        </td>
                        {/* 弓と距離は人ごとに違うので、だれの点かを読めるよう並べる。幅を取らないよう一つの欄にする */}
                        <td className="gear">
                          {entry.bow_type ? (T.options.bowType[entry.bow_type] ?? entry.bow_type) : T.none}
                          <span className="muted small">{entry.distance_m}m</span>
                        </td>
                        <td className="num">
                          <b>{entry.total_score}</b>
                        </td>
                        <td className="num">{entry.ten_count}</td>
                        <td className="num">{entry.x_count}</td>
                        <td className="num">{entry.miss_count}</td>
                        <td className="num">{entry.deviation_score.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">{T.match.result.tieNote}</p>
          <MatchShare matchId={result.match.id} />
        </>
      )}
      <BackButton />
    </div>
  );
}
