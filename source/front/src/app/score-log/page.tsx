"use client";

import AuthGate from "@/components/auth/AuthGate";
import { useEffect, useState } from "react";
import { listGames, toErrorDetails, type ErrorDetails, type GameRead } from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import LogGameCard from "@/components/templates/scoreLog/LogGameCard";
import Header from "@/components/templates/common/header";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";

export default function Page() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { id: userId } = await getCurrentAppUser();
        const games = await listGames(userId);
        if (!cancelled) setGames(games);
      } catch (e) {
        if (!cancelled) setError(toErrorDetails(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthGate>
      <div className="min-h-screen">
        <Header pageName="スコアログ" showBack />
        <div className="ScoreLog flex flex-col p-4 max-w-2xl mx-auto">
          {error && <ApiErrorAlert error={error} />}
          {!loading && !error && games.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-20 text-slate-400">
              <span className="text-4xl">🎯</span>
              <p className="text-sm">まだ記録がありません</p>
            </div>
          )}
          {games.map((game) => (
            <LogGameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
