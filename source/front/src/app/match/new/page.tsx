"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import GameSetupFields, {
  parseGameSetupDraft,
  toGameSetupDraft,
} from "@/components/GameSetupFields";
import MatchInfoFields from "@/components/MatchInfoFields";
import PageHeader from "@/components/PageHeader";
import { createMatch, toErrorDetails, type ErrorDetails } from "@/lib/api";
import { matchPath, toMatchCreate, type MatchInfo } from "@/lib/score/match";
import { DEFAULT_ROUND_SETUP } from "@/lib/score/scoreConfig";
import { loadRoundSetup } from "@/lib/storage";
import { useT } from "@/lib/text";

/**
 * 試合を作る画面。試合はここでだけ作る。作ったら試合の画面へ移り、そこで QR を出し、
 * 作った人もほかの人と同じく「この試合に参加」から自分のゲームを始める
 */
export default function Page() {
  const T = useT();
  const router = useRouter();
  const [info, setInfo] = useState<MatchInfo>({ title: "", description: "" });
  // 揃える数の欄。弓・距離などの欄は出さず、数だけを使う
  const [draft, setDraft] = useState(() => toGameSetupDraft(DEFAULT_ROUND_SETUP));
  const [error, setError] = useState<ErrorDetails | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);

  // サーバーでの描画中は localStorage を読めないので、ふだんの数(前回の設定)は画面に載ってから当てる
  useEffect(() => {
    const saved = loadRoundSetup();
    if (saved) setDraft(toGameSetupDraft(saved));
  }, []);

  const setup = parseGameSetupDraft(draft);

  async function submit() {
    if (setup === null || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const match = await createMatch(toMatchCreate(setup, info));
      router.push(matchPath(match.id));
    } catch (e) {
      setError(toErrorDetails(e));
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.match.create.title} />
      <div className="MatchCreate panel stack">
        <MatchInfoFields
          info={info}
          onChange={setInfo}
        />
      </div>
      <div className="section-label">{T.match.create.sizes}</div>
      <div className="MatchCreateSizes panel stack">
        <GameSetupFields
          draft={draft}
          onChange={setDraft}
          part="sizes"
          hideHints
        />
      </div>
      {error && <ApiErrorAlert error={error} />}
      <button
        type="button"
        className="MatchCreateSubmit primary large block"
        disabled={setup === null || busy}
        onClick={submit}
      >
        {busy ? T.saving : T.match.create.submit}
      </button>
      <BackButton />
    </div>
  );
}
