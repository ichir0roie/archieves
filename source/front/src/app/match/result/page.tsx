"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { MATCH_LIST_PATH } from "@/lib/destinations";
import { MATCH_ID_PARAM, matchPath, parseMatchId } from "@/lib/score/match";
import { useT } from "@/lib/text";

/**
 * 前の試合の結果の画面。結果は試合の画面にまとめたので、そちらへ移すだけ残す
 * (先に配った URL・ブックマークで来ても迷わないように)
 */
export default function Page() {
  const T = useT();
  const router = useRouter();
  const params = useQueryParams();

  useEffect(() => {
    if (params === null) return;
    const matchId = parseMatchId(params.get(MATCH_ID_PARAM));
    router.replace(matchId ? matchPath(matchId) : MATCH_LIST_PATH);
  }, [params, router]);

  return <p className="status empty">{T.loading}</p>;
}
