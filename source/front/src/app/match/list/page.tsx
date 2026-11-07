"use client";

import Link from "next/link";
import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { listMyMatches, type MatchRead } from "@/lib/api";
import { MATCH_PATH, START_GAME } from "@/lib/destinations";
import { formatDateTime } from "@/lib/formatDateTime";
import {
  matchJoinPath,
  matchRankingPath,
  matchResultPath,
  matchSetupPath,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

function MatchCard({ match }: { match: MatchRead }) {
  const T = useT();
  const total = match.end_size * match.round_size * match.game_size;
  return (
    <div className="MatchCard panel stack tight">
      <div className="match-summary-head">
        <Link
          href={matchResultPath(match.id)}
          className="MatchCardTitle match-card-title"
        >
          {match.title ?? T.match.badge(match.id)}
        </Link>
        <span className="muted small">{formatDateTime(match.held_at)}</span>
      </div>
      <div className="match-card-tags">
        {match.organized_by_me && <span className="MatchRoleOrganizer tag">{T.match.list.organizer}</span>}
        {match.my_game_count > 0 && (
          <span className="MatchRoleParticipant tag">
            {T.match.list.participant}・{T.match.list.myGames(match.my_game_count)}
          </span>
        )}
        {match.title && <span className="muted small">{T.match.badge(match.id)}</span>}
      </div>
      {match.description && <p className="MatchCardDescription match-card-description">{match.description}</p>}
      <div className="muted small">
        {T.game.setup.summary(
          total,
          String(match.end_size),
          String(match.round_size),
          String(match.game_size),
        )}
        {" / "}
        {T.match.gameCount(match.game_count)}
        {match.organizer && ` / ${T.match.organizer}: ${match.organizer.name}`}
      </div>
      <div className="match-card-links">
        <Link
          href={matchResultPath(match.id)}
          className="MatchCardResult"
        >
          {T.match.list.result}
        </Link>
        <Link
          href={matchSetupPath(match.id)}
          className="MatchCardJoin"
        >
          {T.match.list.join}
        </Link>
        <Link
          href={matchRankingPath(match.id)}
          className="MatchCardRanking"
        >
          {T.match.list.ranking}
        </Link>
        <Link
          href={matchJoinPath(match.id)}
          className="MatchCardShare"
        >
          {T.match.list.share}
        </Link>
      </div>
    </div>
  );
}

/** 自分が作った試合と、参加した試合の一覧。試合ごとに、結果・参加・ランキング・共有へ行ける */
export default function Page() {
  const T = useT();
  // 上げると読み直す(画面に戻ったとき)。ほかの人の記録でゲームの数が増えていく
  const [reloadKey, setReloadKey] = useState(0);
  useOnResume(() => setReloadKey((key) => key + 1));
  const { data, loading, error } = useLoad(listMyMatches, [reloadKey]);

  return (
    <div className="page">
      <PageHeader title={T.match.list.title} />
      <div className="row">
        <Link
          href={START_GAME.href}
          className="MatchListCreate"
        >
          {T.match.list.create}
        </Link>
        <Link
          href={MATCH_PATH}
          className="MatchListFind"
        >
          {T.match.list.findByCode}
        </Link>
      </div>
      <p className="muted small">{T.match.list.lead}</p>
      {error && <ApiErrorAlert error={error} />}
      {loading && !data && <p className="status empty">{T.loading}</p>}
      {data && data.length === 0 && <p className="MatchListEmpty status empty">{T.match.list.empty}</p>}
      {data && data.length > 0 && (
        <div className="MatchList stack">
          {data.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
            />
          ))}
        </div>
      )}
      <BackButton />
    </div>
  );
}
