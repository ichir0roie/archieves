"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then(({ userId }) => {
      if (!cancelled) router.replace(`/profile/${userId}`);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="page">
      <p className="status empty">{T.loading}</p>
    </div>
  );
}
