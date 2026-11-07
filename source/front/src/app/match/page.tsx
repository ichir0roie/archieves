"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import Field from "@/components/Field";
import MatchShare from "@/components/MatchShare";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { getMatch, listMyMatches } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import {
  MATCH_ID_PARAM,
  matchJoinPath,
  matchResultPath,
  matchSetupPath,
  parseMatchId,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const [idText, setIdText] = useState("");
  // 探す試合。URL の ?id=(QR・共有の URL)か、探すボタンで決める
  const [matchId, setMatchId] = useState<string | null>(null);

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    const id = parseMatchId(new URLSearchParams(window.location.search).get(MATCH_ID_PARAM));
    if (id !== null) {
      setIdText(id);
      setMatchId(id);
    }
  }, []);

  const found = useLoad(() => (matchId === null ? Promise.resolve(null) : getMatch(matchId)), [matchId]);
  const mine = useLoad(listMyMatches, []);
  const match = found.data && found.data.id === matchId ? found.data : null;
  const parsedId = parseMatchId(idText);

  function find() {
    if (parsedId === null) return;
    setIdText(parsedId);
    setMatchId(parsedId);
    // 共有・読み直しのため、探した試合を URL に残す
    window.history.replaceState(null, "", matchJoinPath(parsedId));
  }

  return (
    <div className="page">
      <PageHeader title={T.match.title} />

      <div className="MatchJoin panel stack">
        <div className="section-label">{T.match.join.title}</div>
        <Field
          label={T.match.join.idLabel}
          hint={T.match.join.idHint}
        >
          {(id) => (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                find();
              }}
            >
              <input
                id={id}
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="grow match-code-input"
                value={idText}
                onChange={(e) => setIdText(e.target.value)}
              />
              <button
                type="submit"
                disabled={parsedId === null}
              >
                {T.match.join.find}
              </button>
            </form>
          )}
        </Field>
        {found.error?.status === 404 && (
          <p className="MatchNotFound status error">{T.match.join.notFound}</p>
        )}
        {found.error && found.error.status !== 404 && <ApiErrorAlert error={found.error} />}
      </div>

      {match && (
        <>
          <MatchSummary match={match} />
          <div className="panel stack tight">
            <button
              type="button"
              className="MatchJoinStart primary large block"
              onClick={() => router.push(matchSetupPath(match.id))}
            >
              {T.match.join.start}
            </button>
            <span className="hint">{T.match.join.startHint}</span>
            <Link href={matchResultPath(match.id)}>{T.match.result.title}</Link>
          </div>
          <MatchShare matchId={match.id} />
        </>
      )}

      <div className="section-label">{T.match.mine.title}</div>
      {mine.error && <ApiErrorAlert error={mine.error} />}
      {mine.loading && !mine.data && <p className="status empty">{T.loading}</p>}
      {mine.data && mine.data.length === 0 && <p className="status empty">{T.match.mine.empty}</p>}
      {mine.data && mine.data.length > 0 && (
        <div className="MyMatches row-list">
          {mine.data.map((item) => (
            <Link
              key={item.id}
              href={matchResultPath(item.id)}
            >
              <div className="main">
                <span>{T.match.badge(item.id)}</span>
                <span className="muted small">{formatDateTime(item.held_at)}</span>
              </div>
              <div className="side">
                <span className="muted small">{T.match.gameCount(item.game_count)}</span>
                {item.organizer && <span className="muted small">{item.organizer.name}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
      <BackButton />
    </div>
  );
}
