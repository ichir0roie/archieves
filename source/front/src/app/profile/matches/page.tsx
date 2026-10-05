"use client";

import { useEffect, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ExternalLink from "@/components/ExternalLink";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import {
  GameRead,
  MatchSummary,
  createMatch,
  deleteMatch,
  listGames,
  listMatches,
  toErrorDetails,
  updateMatch,
  type ErrorDetails,
} from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { T } from "@/lib/text";

function formatDate(recordedAt: string): string {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return T.notSet;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(date);
}

type RowProps = {
  game: GameRead;
  match: MatchSummary | null;
  onSaved: (match: MatchSummary | null) => void;
};

function MatchRow({ game, match, onSaved }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(match?.name ?? "");
  const [link, setLink] = useState(match?.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (match) {
        const updated = await updateMatch(match.id, { name, link: link || null });
        onSaved({ ...match, name: updated.name, link: updated.link });
      } else {
        const created = await createMatch(game.id, { name, link: link || null });
        onSaved({
          id: created.id,
          game_id: created.game_id,
          user_id: created.user_id,
          name: created.name,
          link: created.link,
          recorded_at: game.recorded_at,
        });
      }
      setEditing(false);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!match) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMatch(match.id);
      onSaved(null);
      setName("");
      setLink("");
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setName(match?.name ?? "");
    setLink(match?.link ?? "");
  }

  return (
    <div className="MatchRow panel stack tight">
      <div className="row">
        <span className="section-label grow">{formatDate(game.recorded_at)}</span>
        {match ? (
          <>
            <button
              type="button"
              className="ghost"
              onClick={() => setEditing(true)}
            >
              {T.profile.matches.edit}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={handleDelete}
              disabled={saving}
            >
              {T.delete}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
          >
            {T.profile.matches.register}
          </button>
        )}
      </div>

      {error && !editing && <ApiErrorAlert error={error} />}

      {match ? (
        <div className="row">
          <span className="grow">{match.name}</span>
          {match.link && <ExternalLink href={match.link}>{T.profile.link}</ExternalLink>}
        </div>
      ) : (
        <span className="muted small">{T.profile.matches.notRegistered}</span>
      )}

      {editing && (
        <Modal
          title={match ? T.profile.matches.edit : T.profile.matches.register}
          onClose={handleCancel}
          actions={
            <>
              <button
                type="button"
                onClick={handleCancel}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSave}
                disabled={saving || !name}
              >
                {T.save}
              </button>
            </>
          }
        >
          <div className="stack tight">
            {error && <ApiErrorAlert error={error} />}
            <Field label={T.profile.matches.name}>
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              )}
            </Field>
            <Field label={T.profile.matches.link}>
              {(id) => (
                <input
                  id={id}
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              )}
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Page() {
  const [games, setGames] = useState<GameRead[]>([]);
  const [matchesByGameId, setMatchesByGameId] = useState<Map<number, MatchSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { id: userId } = await getCurrentAppUser();
        const [gameList, matchList] = await Promise.all([
          listGames(userId),
          listMatches({ userId }),
        ]);
        if (cancelled) return;
        setGames([...gameList].reverse());
        setMatchesByGameId(new Map(matchList.map((m) => [m.game_id, m])));
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

  function handleSaved(gameId: number, match: MatchSummary | null) {
    setMatchesByGameId((prev) => {
      const next = new Map(prev);
      if (match) next.set(gameId, match);
      else next.delete(gameId);
      return next;
    });
  }

  return (
    <div className="page">
      <PageHeader title={T.profile.matches.title} />
      {error && <ApiErrorAlert error={error} />}
      {loading && <p className="status empty">{T.loading}</p>}
      {!loading && games.length === 0 && !error && <p className="status empty">{T.profile.matches.empty}</p>}
      {games.map((game) => (
        <MatchRow
          key={game.id}
          game={game}
          match={matchesByGameId.get(game.id) ?? null}
          onSaved={(match) => handleSaved(game.id, match)}
        />
      ))}
    </div>
  );
}
