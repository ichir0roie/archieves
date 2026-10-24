"use client";

import BackButton from "@/components/BackButton";
import GameSetupFields, {
  parseGameSetupDraft,
  toGameSetupDraft,
} from "@/components/GameSetupFields";
import PageHeader from "@/components/PageHeader";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_ROUND_SETUP } from "@/lib/score/scoreConfig";
import { BACKFILL_DATE_PARAM, isBackfillDate } from "@/lib/score/backfill";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH } from "@/lib/destinations";
import { ScoreManager } from "@/lib/score/scoreManager";
import { loadRoundSetup, saveRoundSetup } from "@/lib/storage";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const [draft, setDraft] = useState(() => toGameSetupDraft(DEFAULT_ROUND_SETUP));
  // あとから入力の日付。スコアの一覧から ?date=yyyy-mm-dd で来る。無い・読めない日付なら今の日時で付ける
  const [backfillDate, setBackfillDate] = useState<string | null>(null);

  // サーバーでの描画中は localStorage を読めないので、前回の設定は画面に載ってから当てる
  useEffect(() => {
    const saved = loadRoundSetup();
    if (saved) setDraft(toGameSetupDraft(saved));
  }, []);

  // useSearchParams は Suspense で包まないとビルドの事前描画で落ちるので、画面に載ってから URL を読む
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get(BACKFILL_DATE_PARAM);
    if (isBackfillDate(date)) setBackfillDate(date);
  }, []);

  // 読めない欄があれば null。開始もここで止める
  const setup = parseGameSetupDraft(draft);
  // 開始は sub を引いてから進むので、二度押しで二つ始めないようにする
  const starting = useRef(false);

  /** numberPad: 点だけ入力(数字のボタン)で始める。入れ方はゲームの途中では変えない */
  async function start(numberPad: boolean) {
    if (setup === null || starting.current) return;
    starting.current = true;
    try {
      const { userId } = await getCurrentUser();
      // 入力の途中のゲームの、保存していない記録はキャッシュにしか無い。始めると捨てるので確かめる
      if (ScoreManager.hasUnsavedCache(userId) && !window.confirm(T.game.setup.discardUnsaved)) {
        return;
      }
      saveRoundSetup(setup);
      // この画面からは必ず新しいゲームを始める(手元のキャッシュを作り直す)。続きはこの画面を通らない
      ScoreManager.startNewGame(userId, setup, backfillDate, numberPad);
      router.push(SCORE_CARD_PATH);
    } finally {
      starting.current = false;
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.game.setup.title} />
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
      </div>
      {/* 設定の欄が長いので、開始はどこまで送っても押せるよう画面の下に留める */}
      <div className="SetupStart setup-start">
        <span className="hint">{T.game.setup.numberPadHint}</span>
        <div className="row">
          <button
            type="button"
            className="StartTarget primary large grow"
            disabled={setup === null}
            onClick={() => start(false)}
          >
            {T.game.setup.startTarget}
          </button>
          <button
            type="button"
            className="StartNumberPad primary large grow"
            disabled={setup === null}
            onClick={() => start(true)}
          >
            {T.game.setup.startNumberPad}
          </button>
        </div>
      </div>
      <BackButton />
    </div>
  );
}
