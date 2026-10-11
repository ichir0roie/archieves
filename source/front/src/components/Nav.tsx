"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSignOut } from "@/components/AuthGate";
import { useCachedAppUser } from "@/hooks/useCachedAppUser";
import { isMockAuth } from "@/lib/auth/config";
import { DESTINATIONS, SCORE_CARD_PATH, type Destination } from "@/lib/destinations";
import { useMenuPosition } from "@/lib/menuPosition";
import { useT } from "@/lib/text";

// 点数の入力の画面は画面全体をキーと的に使い、右下のボタンがキーに重なるので出さない(戻るは画面の ✕)
const FULL_SCREEN_PATHS = [SCORE_CARD_PATH];

/** 画面の隅に小さな丸いメニューボタンを浮かべ(位置は設定画面で選ぶ。未設定ならデスクトップは左上、スマホは右下)、押したときだけメニューを開く。
 * 開いたメニューは、外を押す、Esc、リンクを押す、のいずれかで閉じる。 */
export default function Nav() {
  const T = useT();
  const pathname = usePathname();
  const signOut = useSignOut();
  const position = useMenuPosition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // 画面を開くたびに API を叩かないよう、キャッシュの値で決める。登録の前は無いので、管理者でないとみなす
  const me = useCachedAppUser();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (FULL_SCREEN_PATHS.includes(pathname)) return null;

  function link(item: Destination) {
    return (
      <Link
        key={item.href}
        href={item.href}
        className={pathname.startsWith(item.href) ? "active" : ""}
      >
        {T.nav[item.label]}
      </Link>
    );
  }

  return (
    <nav
      ref={ref}
      data-pos={position ?? undefined}
    >
      <button
        type="button"
        className={`nav-fab ${open ? "open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={T.nav.menu}
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className="nav-panel"
          onClick={(e) => {
            // 今いるページのリンクでもページは変わらないので、押したら閉じる
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <Link
            href="/"
            className={`brand ${pathname === "/" ? "active" : ""}`}
          >
            {T.appName}
          </Link>
          {DESTINATIONS.filter((item) => !item.adminOnly).map(link)}
          {me?.isAdmin && (
            <>
              <hr />
              {DESTINATIONS.filter((item) => item.adminOnly).map(link)}
            </>
          )}
          {!isMockAuth() && (
            <>
              <hr />
              <button
                type="button"
                onClick={signOut}
              >
                {T.nav.signOut}
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
