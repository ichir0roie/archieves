"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import { useLoad } from "@/hooks/useLoad";
import { getPendingCounts, type AdminPendingCounts } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { SCORE_CARD_PATH, START_GAME, destinationsFor } from "@/lib/destinations";
import { loadScoreSheetCache } from "@/lib/storage";
import { useT } from "@/lib/text";

/** 管理者の行き先のボタンに出す、未対応の件数 */
function pendingCountFor(href: string, counts: AdminPendingCounts | null): number {
  if (counts === null) return 0;
  if (href === "/admin/feedbacks") return counts.unanswered_feedbacks;
  if (href === "/admin/error-reports") return counts.unresolved_error_reports;
  return 0;
}

/**
 * ホーム。開いただけで API を叩かないよう、行き先のボタンだけを並べ、名前はキャッシュから出す。
 * 管理者だけは例外で、未回答の意見・未対応のエラーの件数を読んで、管理者の行き先のボタンに出す
 */
export default function Page() {
  const T = useT();
  const currentUser = useCachedAppUser();
  const isAdmin = currentUser?.isAdmin ?? false;
  const pendingCounts = useLoad(
    () => (isAdmin ? getPendingCounts() : Promise.resolve(null)),
    [isAdmin],
  );
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
  const otherDestinations = destinationsFor(isAdmin).filter(
    (item) => item !== START_GAME,
  );

  return (
    <div className="page">
      <div className="hero">
        {/* アプリのアイコン(src/app/icon.svg)をそのまま出す */}
        <Image
          className="logo"
          src="/icon.svg"
          alt=""
          width={56}
          height={56}
          priority
        />
        <h1>{T.appName}</h1>
        <p className="muted small">{currentUser ? T.home.welcome(currentUser.name) : T.home.tagline}</p>
      </div>

      <div className="HomeMenu">
        <div className="grid">
          {otherDestinations.map((item) => {
            const pending = pendingCountFor(item.href, pendingCounts.data);
            return (
              <Link
                key={item.href}
                href={item.href}
              >
                {T.nav[item.label]}
                {pending > 0 && (
                  <span
                    className="PendingBadge pending-badge"
                    aria-label={T.support.pending.badge(pending)}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 親指の届く画面の下中央に置く。左右はメニューのボタン(下の隅に置ける)と重ならない幅にする */}
      <div className="HomeStart">
        {canResume && (
          <Link
            href={SCORE_CARD_PATH}
            className="resume"
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
      </div>
    </div>
  );
}
