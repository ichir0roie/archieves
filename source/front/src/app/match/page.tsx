"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import Field from "@/components/Field";
import MatchQrScanner from "@/components/MatchQrScanner";
import MatchShare from "@/components/MatchShare";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { getMatch } from "@/lib/api";
import { MATCH_LIST_PATH } from "@/lib/destinations";
import {
  MATCH_ID_PARAM,
  MATCH_SCAN_PARAM,
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
  // 上げると読み直す(作った人がタイトル・内容を直したとき)
  const [reloadKey, setReloadKey] = useState(0);
  const [scanning, setScanning] = useState(false);

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = parseMatchId(params.get(MATCH_ID_PARAM));
    if (id !== null) {
      setIdText(id);
      setMatchId(id);
    } else if (params.has(MATCH_SCAN_PARAM)) {
      setScanning(true);
    }
  }, []);

  const found = useLoad(
    () => (matchId === null ? Promise.resolve(null) : getMatch(matchId)),
    [matchId, reloadKey],
  );
  const match = found.data && found.data.id === matchId ? found.data : null;
  const parsedId = parseMatchId(idText);

  function show(id: string) {
    setIdText(id);
    setMatchId(id);
    // 共有・読み直しのため、探した試合を URL に残す(?scan も外れる)
    window.history.replaceState(null, "", matchJoinPath(id));
  }

  function find() {
    if (parsedId !== null) show(parsedId);
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
        <button
          type="button"
          className="MatchScanOpen"
          onClick={() => setScanning(true)}
        >
          {T.match.scan.open}
        </button>
        {scanning && (
          <MatchQrScanner
            onClose={() => setScanning(false)}
            onFound={(id) => {
              setScanning(false);
              show(id);
            }}
          />
        )}
        {found.error?.status === 404 && (
          <p className="MatchNotFound status error">{T.match.join.notFound}</p>
        )}
        {found.error && found.error.status !== 404 && <ApiErrorAlert error={found.error} />}
      </div>

      {match && (
        <>
          <MatchSummary
            match={match}
            onUpdated={() => setReloadKey((key) => key + 1)}
            onDeleted={() => router.push(MATCH_LIST_PATH)}
          />
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

      <Link
        href={MATCH_LIST_PATH}
        className="MatchListLink"
      >
        {T.match.list.title}
      </Link>
      <BackButton />
    </div>
  );
}
