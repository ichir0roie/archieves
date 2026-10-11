"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH, START_GAME, destinationsFor } from "@/lib/destinations";
import { loadScoreSheetCache } from "@/lib/storage";
import { useT } from "@/lib/text";

/** ホーム。開いただけで API を叩かないよう、行き先のボタンだけを並べ、名前はキャッシュから出す */
export default function Page() {
  const T = useT();
  const currentUser = useCachedAppUser();
  // 入力の画面を ✕ で抜けたゲームは、手元のキャッシュに残っている(終了するまで消さない)
  const [canResume, setCanResume] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then(
      ({ userId }) => {
        if (!cancelled) setCanResume(loadScoreSheetCache(userId) !== null);
      },
      () => {
        // ログインが分からなければ、続きは出さない
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const otherDestinations = destinationsFor(currentUser?.isAdmin ?? false).filter(
    (item) => item !== START_GAME,
  );

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
            href={SCORE_CARD_PATH}
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
          {otherDestinations.map((item) => (
            <Link
              key={item.href}
              href={item.href}
            >
              {T.nav[item.label]}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
