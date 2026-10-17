"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import {
  listDeletedGames,
  restoreGame,
  toErrorDetails,
  type ErrorDetails,
  type GameRead,
} from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { useT } from "@/lib/text";

/** 削除したゲームの一覧。戻したゲームは一覧から外し、スコアの一覧に出る。 */
export default function Page() {
  const T = useT();
  const { data, loading, error } = useLoad(() => listDeletedGames(), []);
  const [restoredIds, setRestoredIds] = useState<Array<number>>([]);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<ErrorDetails | null>(null);
  const games = (data ?? []).filter((game) => !restoredIds.includes(game.id));

  async function onRestore(game: GameRead) {
    setRestoreError(null);
    setRestoringId(game.id);
    try {
      await restoreGame(game.id);
      setRestoredIds((current) => [...current, game.id]);
    } catch (e) {
      setRestoreError(toErrorDetails(e));
    } finally {
      setRestoringId(null);
    }
  }

  function formatDate(value: string | null | undefined): string {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(T.intlLocale, {
          dateStyle: "medium",
        }).format(date)
      : T.notSet;
  }

  return (
    <div className="page">
      <PageHeader title={T.profile.trash.title} />
      {error && <ApiErrorAlert error={error} />}
      {restoreError && <ApiErrorAlert error={restoreError} />}
      {loading && <p className="status empty">{T.loading}</p>}
      {!loading && !error && games.length === 0 && (
        <p className="status empty">{T.profile.trash.empty}</p>
      )}
      {games.length > 0 && (
        <div className="TrashList row-list">
          {games.map((game) => (
            <div key={game.id} className="ScoreLogGame">
              <div className="main">
                <span className="section-label">
                  {T.profile.scoreLog.gameId}
                </span>
                <span className="big">{game.id}</span>
              </div>
              <div className="side">
                <span className="section-label">
                  {T.profile.scoreLog.startedAt}
                </span>
                <span>{formatDate(game.recorded_at)}</span>
                <span className="muted small">
                  {T.profile.trash.deletedAt} {formatDate(game.deleted_at)}
                </span>
                <button
                  type="button"
                  className="RestoreGameButton primary"
                  disabled={restoringId !== null}
                  onClick={() => onRestore(game)}
                >
                  {T.profile.trash.restore}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <BackButton />
    </div>
  );
}
