"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import MonthDashboard from "@/components/MonthDashboard";
import { getMyUser, type UserRead } from "@/lib/api";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
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

      <MonthDashboard />

      <Announcements />
    </div>
  );
}
