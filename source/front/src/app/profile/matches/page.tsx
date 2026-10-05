"use client";

import AuthGate from "@/components/AuthGate";
import Header from "@/components/Header";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import { useEffect, useState } from "react";
import { Button, IconButton, TextField, Tooltip } from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
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

function formatDate(recordedAt: string): string {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(date);
}

interface RowProps {
  game: GameRead;
  match: MatchSummary | null;
  onSaved: (match: MatchSummary | null) => void;
}

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

  return (
    <div className="MatchRow flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-500">
          {formatDate(game.recorded_at)}
        </span>
        {!editing && (
          <div className="flex items-center gap-1">
            <Tooltip title={match ? "編集" : "大会情報を登録"}>
              <IconButton size="small" onClick={() => setEditing(true)}>
                <EditRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {match && (
              <Tooltip title="削除">
                <IconButton size="small" onClick={handleDelete} disabled={saving}>
                  <DeleteRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {error && <ApiErrorAlert error={error} />}

      {editing ? (
        <div className="flex flex-col gap-2">
          <TextField
            label="大会名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="関連リンク"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            size="small"
            fullWidth
          />
          <div className="flex justify-end gap-2">
            <Button
              size="small"
              onClick={() => {
                setEditing(false);
                setName(match?.name ?? "");
                setLink(match?.link ?? "");
              }}
            >
              キャンセル
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={saving || !name}
            >
              保存
            </Button>
          </div>
        </div>
      ) : match ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-medium text-slate-800">{match.name}</span>
          {match.link && (
            <a
              href={match.link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
            >
              リンク
              <OpenInNewRoundedIcon fontSize="inherit" />
            </a>
          )}
        </div>
      ) : (
        <span className="text-sm text-slate-400">大会情報は未登録です</span>
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
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="大会情報の登録" showBack />
        <div className="flex w-full flex-col gap-3 p-3 max-w-2xl mx-auto">
          {error && <ApiErrorAlert error={error} />}
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          )}
          {!loading && games.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-20 text-slate-400">
              <span className="text-4xl">🏆</span>
              <p className="text-sm">まだ記録がありません</p>
            </div>
          )}
          {games.map((game) => (
            <MatchRow
              key={game.id}
              game={game}
              match={matchesByGameId.get(game.id) ?? null}
              onSaved={(match) => handleSaved(game.id, match)}
            />
          ))}
        </div>
      </main>
    </AuthGate>
  );
}
