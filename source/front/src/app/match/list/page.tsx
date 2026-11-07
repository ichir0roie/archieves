"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import MatchQrScanner from "@/components/MatchQrScanner";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { useOnResume } from "@/hooks/useOnResume";
import { listMyMatches, type MatchRead } from "@/lib/api";
import { MATCH_NEW_PATH } from "@/lib/destinations";
import { formatDateTime } from "@/lib/formatDateTime";
import {
  matchArrowSummary,
  matchPath,
  matchSetupPath,
  matchTitle,
  parseMatchId,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

/** 一覧の一枚。カード全体を押すと試合の画面へ行く */
function MatchCard({ match }: { match: MatchRead }) {
  const T = useT();
  return (
    <Link
      href={matchPath(match.id)}
      className="MatchCard match-card panel stack tight"
    >
      <div className="match-summary-head">
        <span className="MatchCardTitle match-card-title">{matchTitle(T, match)}</span>
        <span className="muted small">{formatDateTime(match.held_at)}</span>
      </div>
      <div className="match-card-tags">
        {match.organized_by_me && <span className="MatchRoleOrganizer tag">{T.match.list.organizer}</span>}
        {match.my_game_count > 0 && (
          <span className="MatchRoleParticipant tag">
            {T.match.list.participant}・{T.match.list.myGames(match.my_game_count)}
          </span>
        )}
      </div>
      {match.description && <p className="MatchCardDescription match-card-description">{match.description}</p>}
      <span className="muted small">
        {matchArrowSummary(T, match)} / {T.match.gameCount(match.game_count)}
        {match.organizer && ` / ${match.organizer.name}`}
      </span>
    </Link>
  );
}

/**
 * 試合の入口。QR・コードで試合を探す、試合を作る、自分が作った・参加した試合を開く
 */
export default function Page() {
  const T = useT();
  const router = useRouter();
  // 上げると読み直す(画面に戻ったとき)。ほかの人の記録でゲームの数が増えていく
  const [reloadKey, setReloadKey] = useState(0);
  useOnResume(() => setReloadKey((key) => key + 1));
  const { data, loading, error } = useLoad(listMyMatches, [reloadKey]);
  const [scanning, setScanning] = useState(false);
  const [codeText, setCodeText] = useState("");
  const code = parseMatchId(codeText);

  return (
    <div className="page">
      <PageHeader title={T.match.list.title} />
      <div className="action-row">
        <button
          type="button"
          className="MatchListScan primary grow"
          onClick={() => setScanning(true)}
        >
          {T.match.scan.open}
        </button>
        <button
          type="button"
          className="MatchListCreate grow"
          onClick={() => router.push(MATCH_NEW_PATH)}
        >
          {T.match.create.title}
        </button>
      </div>
      <form
        className="MatchFind action-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (code !== null) router.push(matchPath(code));
        }}
      >
        <input
          type="text"
          aria-label={T.match.find.label}
          placeholder={T.match.find.placeholder}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="grow match-code-input"
          value={codeText}
          onChange={(e) => setCodeText(e.target.value)}
        />
        <button
          type="submit"
          disabled={code === null}
        >
          {T.match.find.open}
        </button>
      </form>
      {scanning && (
        <MatchQrScanner
          onClose={() => setScanning(false)}
          // アプリの中で読むのは参加するときなので、試合の画面を飛ばして参加の設定へ行く
          onFound={(matchId) => router.push(matchSetupPath(matchId))}
        />
      )}
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
