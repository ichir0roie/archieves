"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    getCurrentAppUser().then(({ id }) => {
      if (!cancelled) router.replace(`/profile/${id}`);
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
