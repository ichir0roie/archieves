"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { sendErrorReport } from "@/lib/api";
import { useT } from "@/lib/text";
import { useRunOnce } from "@/lib/useRunOnce";

async function reportMissingPage() {
  sendErrorReport({
    kind: "page",
    status_code: 404,
    page_path: window.location.pathname,
  });
}

/** 無いページ。エラーの集積に送り、ホームへ移る */
export default function NotFound() {
  const T = useT();
  const router = useRouter();
  const { runOnMount } = useRunOnce(reportMissingPage);

  useEffect(() => {
    runOnMount();
    router.replace("/");
  }, [runOnMount, router]);

  return <p className="status empty">{T.loading}</p>;
}
