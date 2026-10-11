"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import { DESTINATIONS } from "@/lib/destinations";
import { readScoreSheetCache } from "@/lib/score/scoreSheetCache";
import { useT } from "@/lib/text";

const [START_GAME, ...OTHER_DESTINATIONS] = DESTINATIONS;

/** ホーム。開いただけで API を叩かないよう、行き先のボタンだけを並べ、名前はキャッシュから出す */
export default function Page() {
  const T = useT();
  const currentUser = useCachedAppUser();
  // 入力の画面を ✕ で抜けたゲームは、手元のキャッシュに残っている(終了するまで消さない)
  const [canResume, setCanResume] = useState(false);

  useEffect(() => {
    setCanResume(readScoreSheetCache() !== null);
  }, []);

  return (
    <div className="page">
      <div className="hero">
        <div
          className="logo"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="1.5"
              fill="currentColor"
            />
          </svg>
        </div>
        <h1>{T.appName}</h1>
        <p className="muted small">{currentUser ? T.home.welcome(currentUser.name) : T.home.tagline}</p>
      </div>

      <div className="HomeMenu">
        {canResume && (
          <Link
            href="/game/score-card"
            className="start"
          >
            {T.nav.resumeGame}
          </Link>
        )}
        <Link
          href={START_GAME.href}
          className="start"
        >
          {T.nav[START_GAME.label]}
        </Link>
        <div className="grid">
          {OTHER_DESTINATIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
            >
              {T.nav[item.label]}
            </Link>
          ))}
          {currentUser?.isAdmin && <Link href="/admin/feedbacks">{T.nav.adminFeedback}</Link>}
        </div>
      </div>
    </div>
  );
}
