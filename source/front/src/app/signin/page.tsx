"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/text";

/**
 * ログインしていない人のサインインのボタンの行き先。ここはログインしなくても開ける画面に入れないので、
 * ログインの門(AuthGate)がサインインの画面を出し、サインインが済むとここを描く。描いたらホームへ戻す
 */
export default function Page() {
  const T = useT();
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="page">
      <p className="status empty">{T.loading}</p>
    </div>
  );
}
