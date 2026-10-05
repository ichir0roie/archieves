"use client";

import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import LogGameCard from "@/components/LogGameCard";
import PageHeader from "@/components/PageHeader";
import { listGames, toErrorDetails, type ErrorDetails, type GameRead } from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { T } from "@/lib/text";

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
    <div className="page">
      <PageHeader title={T.profile.scoreLog.title} />
      {error && <ApiErrorAlert error={error} />}
      {loading && <p className="status empty">{T.loading}</p>}
      {!loading && !error && games.length === 0 && <p className="status empty">{T.profile.scoreLog.empty}</p>}
      {games.length > 0 && (
        <div className="ScoreLog row-list">
          {games.map((game) => (
            <LogGameCard
              key={game.id}
              game={game}
            />
          ))}
        </div>
      )}
    </div>
  );
}
