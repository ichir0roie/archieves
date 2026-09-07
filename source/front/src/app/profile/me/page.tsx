"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/auth/AuthGate";
import { getCurrentUser } from "@/lib/auth/currentUser";

export default function Page() {
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
    <AuthGate>
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        読み込み中...
      </main>
    </AuthGate>
  );
}
