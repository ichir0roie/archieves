"use client";

import BackButton from "@/components/BackButton";
import GameSetupFields, {
  parseGameSetupDraft,
  toGameSetupDraft,
} from "@/components/GameSetupFields";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import MatchSummary from "@/components/MatchSummary";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_ROUND_SETUP } from "@/lib/score/scoreConfig";
import { getMatch } from "@/lib/api";
import {
  SETUP_MATCH_PARAM,
  matchRecordedAt,
  parseMatchId,
  matchTitle,
  withMatchSizes,
} from "@/lib/score/match";
import { BACKFILL_DATE_PARAM, isBackfillDate } from "@/lib/score/backfill";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH } from "@/lib/destinations";
import { ScoreManager } from "@/lib/score/scoreManager";
import {
  loadLastNumberPad,
  loadRoundSetup,
  saveLastNumberPad,
  saveRoundSetup,
} from "@/lib/storage";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const [draft, setDraft] = useState(() => toGameSetupDraft(DEFAULT_ROUND_SETUP));
  // 点だけ入力(数字のボタン)で始めるか。前回の選び方を覚えておき、普段は触らずに始められるようにする
  const [numberPad, setNumberPad] = useState(false);
  const params = useQueryParams();
  const matchParam = params?.get(SETUP_MATCH_PARAM) ?? null;
  // 参加する試合。試合の画面から ?match=<コード> で来る。URL を読むまでは undefined、無ければ null、
  // 読めないコードなら ""
  const joinMatchId = params === null ? undefined : matchParam === null ? null : (parseMatchId(matchParam) ?? "");
  // あとから入力の日付。スコアの一覧から ?date=yyyy-mm-dd で来る。無い・読めない日付なら今の日時で付ける。
  // 試合のゲームの日付は試合の日にするので、試合に参加するときは使わない
  const dateParam = params?.get(BACKFILL_DATE_PARAM) ?? null;
  const backfillDate = joinMatchId === null && isBackfillDate(dateParam) ? dateParam : null;

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    const saved = loadRoundSetup();
    if (saved) setDraft(toGameSetupDraft(saved));
    setNumberPad(loadLastNumberPad());
  }, []);

  const joining = useLoad(
    () => (joinMatchId ? getMatch(joinMatchId) : Promise.resolve(null)),
    [joinMatchId],
  );
  const joinMatch = joinMatchId && joining.data?.id === joinMatchId ? joining.data : null;
  // 読めないコード("")と、無い試合
  const joinNotFound = joinMatchId === "" || joining.error?.status === 404;

  // 試合の数を欄に当てる。試合は前回の設定(画面に載った時に当てる)より後に読めるので、上書きになる
  useEffect(() => {
    if (joinMatch === null) return;
    setDraft((current) => ({
      ...current,
      endSizeText: String(joinMatch.end_size),
      roundSizeText: String(joinMatch.round_size),
      gameSizeText: String(joinMatch.game_size),
    }));
  }, [joinMatch]);

  // 読めない欄があれば null。開始もここで止める
  const parsed = parseGameSetupDraft(draft);
  const setup = parsed && joinMatch ? withMatchSizes(parsed, joinMatch) : parsed;
  // 試合に参加するなら、試合を読めるまで始めさせない
  const canStart = setup !== null && (joinMatchId === null || joinMatch !== null);
  // 開始は sub を引いてから進むので、二度押しで二つ始めないようにする
  const starting = useRef(false);

  /** 新しいゲームを始める。試合に参加するときは、その試合のゲームにする */
  async function start() {
    if (setup === null || !canStart || starting.current) return;
    starting.current = true;
    try {
      const { userId } = await getCurrentUser();
      // 入力の途中のゲームの、保存していない記録はキャッシュにしか無い。始めると捨てるので確かめる
      if (ScoreManager.hasUnsavedCache(userId) && !window.confirm(T.game.setup.discardUnsaved)) {
        return;
      }
      const match = joinMatch;
      // 参加した試合の数は、次に自分で始めるときの設定に残さない
      const saved = loadRoundSetup();
      saveRoundSetup(
        joinMatch && saved
          ? {
              ...setup,
              gameSize: saved.gameSize,
              roundSize: saved.roundSize,
              endSize: saved.endSize,
            }
          : setup,
      );
      saveLastNumberPad(numberPad);
      // この画面からは必ず新しいゲームを始める(手元のキャッシュを作り直す)。続きはこの画面を通らない
      ScoreManager.startNewGame(
        userId,
        setup,
        backfillDate,
        numberPad,
        match ? { id: match.id, recordedAt: matchRecordedAt(match) } : null,
      );
      router.push(SCORE_CARD_PATH);
    } finally {
      starting.current = false;
    }
  }

  // 試合に参加する(?match= で来た)ときだけ、試合の区画を出し、数の欄を試合の区画へ分ける。
  // ふつうに始めるときは、スコアの設定だけの画面にする(試合は試合の画面で作る)
  const joiningMatch = joinMatchId !== null && joinMatchId !== undefined;

  const numberPadField = (
    <div className="field">
      <label className="NumberPadSetupField check-field">
        <input
          type="checkbox"
          checked={numberPad}
          onChange={(e) => setNumberPad(e.target.checked)}
        />
        {T.game.setup.numberPad}
      </label>
      <span className="hint">{T.game.setup.numberPadHint}</span>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title={
          joiningMatch && joinMatchId
            ? T.match.setup.title(joinMatch ? matchTitle(T, joinMatch) : T.match.title)
            : T.game.setup.title
        }
      />
      {joiningMatch ? (
        <>
          <div className="section-label">{T.match.setup.matchSection}</div>
          {joinMatch && (
            <MatchSummary
              match={joinMatch}
              compact
            />
          )}
          {joinNotFound && <p className="MatchNotFound status error">{T.match.setup.notFound}</p>}
          {joining.error && joining.error.status !== 404 && <ApiErrorAlert error={joining.error} />}
          {joining.loading && !joinMatch && <p className="status empty">{T.loading}</p>}
          {joinMatch && (
            <div className="MatchSizes panel stack">
              <div className="section-label">{T.match.setup.sizesSection}</div>
              <GameSetupFields
                draft={draft}
                onChange={setDraft}
                sizesFixed
                part="sizes"
              />
            </div>
          )}
          <div className="section-label">{T.match.setup.gearSection}</div>
          <div className="MatchGear panel stack">
            <span className="hint">{T.match.sharedNote}</span>
            <GameSetupFields
              draft={draft}
              onChange={setDraft}
              part="gear"
            />
            {numberPadField}
          </div>
        </>
      ) : (
        <>
          {backfillDate && (
            <div className="BackfillNotice panel stack tight">
              <b>{T.game.setup.backfill(backfillDate)}</b>
              <span className="muted small">{T.game.backfillHint}</span>
            </div>
          )}
          <div className="panel stack">
            <GameSetupFields
              draft={draft}
              onChange={setDraft}
            />
            {numberPadField}
          </div>
        </>
      )}
      {/* 設定の欄が長いので、開始はどこまで送っても押せるよう画面の下に留める */}
      <div className="SetupStart setup-start">
        <button
          type="button"
          className="primary large block"
          disabled={!canStart}
          onClick={() => start()}
        >
          {joiningMatch ? T.match.setup.start : T.game.setup.start}
        </button>
      </div>
      <BackButton />
    </div>
  );
}
