"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MonthDashboard from "@/components/MonthDashboard";
import { getMyUser, type UserRead } from "@/lib/api";
import { T } from "@/lib/text";

export default function Page() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 登録の前(AuthGate がプロフィールの登録へ送る前)は無いので、失敗しても名前を出さないだけにする
    getMyUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

      <div className="panel stack tight">
        <button
          type="button"
          className="primary large block"
          onClick={() => router.push("/game")}
        >
          {T.home.startScore}
        </button>
        <button
          type="button"
          className="large block"
          onClick={() => router.push("/profile/matches")}
        >
          {T.home.registerMatch}
        </button>
        <button
          type="button"
          className="ghost large block"
          onClick={() => router.push("/profile/settings")}
        >
          {T.home.profileSettings}
        </button>
      </div>

      <MonthDashboard />
    </div>
  );
}
