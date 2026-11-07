"use client";

import Link from "next/link";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import type { MatchStanding, MatchStatistics } from "@/lib/api";
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
    <div className="MatchStatistics match-stats">
      {items.map((item) => (
        <div key={item.label}>
          <span className="muted small">{item.label}</span>
          <span className="value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 試合の結果(合計点の集計と、全員の順位の表)。自分の行は目立たせ、自分のスコアへ行ける */
export default function MatchStandingView({ standing }: { standing: MatchStanding }) {
  const T = useT();
  const me = useCachedAppUser();
  if (standing.entries.length === 0) {
    return <p className="status empty">{T.match.result.empty}</p>;
  }
  return (
    <div className="stack tight">
      <StatisticsPanel statistics={standing.statistics} />
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
            {standing.entries.map((entry) => {
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
      <p className="muted small">{T.match.result.tieNote}</p>
    </div>
  );
}
