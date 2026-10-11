"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import LogGameCard from "@/components/LogGameCard";
import LogGroup from "@/components/LogGroup";
import BackButton from "@/components/BackButton";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import YearSwitcher from "@/components/YearSwitcher";
import { listGameScoresOfYear, listGameYears, listGamesOfYear } from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { BACKFILL_DATE_PARAM, isBackfillDate } from "@/lib/score/backfill";
import { groupGamesByDate } from "@/lib/scoreLogGroups";
import { loadScoreLogCollapsed, saveScoreLogCollapsed } from "@/lib/storage";
import { useT } from "@/lib/text";
import { toDateOnly } from "@/lib/toDateOnly";

export default function Page() {
  const T = useT();
  const router = useRouter();
  // null のあいだは、ゲームのある一番新しい年を出す
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { data, loading, error } = useLoad(async () => {
    const { id: userId } = await getCurrentAppUser();
    const years = await listGameYears(userId);
    const year = selectedYear ?? years[0] ?? null;
    const [games, scores] =
      year === null
        ? [[], []]
        : await Promise.all([
            listGamesOfYear(userId, year),
            listGameScoresOfYear(userId, year),
          ]);
    return { years, year, games, scores };
  }, [selectedYear]);
  const years = data?.years ?? [];
  const year = data?.year ?? null;
  const games = useMemo(() => data?.games ?? [], [data]);
  const scoreByGameId = useMemo(
    () => new Map((data?.scores ?? []).map((score) => [score.game_id, score])),
    [data],
  );
  const months = useMemo(
    () => groupGamesByDate(games).years.flatMap((group) => group.months),
    [games],
  );
  const yearIndex = year === null ? -1 : years.indexOf(year);
  const [collapsed, setCollapsed] = useState<Array<string>>([]);
  // あとから入力のモーダルで選んでいる日付。閉じているあいだは null
  const [backfillDate, setBackfillDate] = useState<string | null>(null);

  // サーバーでの描画中は localStorage を読めないので、前回の開閉は画面に載ってから当てる
  useEffect(() => {
    setCollapsed(loadScoreLogCollapsed());
  }, []);

  function updateCollapsed(keys: Array<string>) {
    setCollapsed(keys);
    saveScoreLogCollapsed(keys);
  }

  function toggle(key: string) {
    updateCollapsed(
      collapsed.includes(key)
        ? collapsed.filter((k) => k !== key)
        : [...collapsed, key],
    );
  }

  return (
    <div className="page">
      <PageHeader title={T.profile.scoreLog.title} />
      <button
        type="button"
        className="primary block"
        onClick={() => router.push("/game/setup")}
      >
        {T.profile.scoreLog.newRecord}
      </button>
      <button
        type="button"
        className="BackfillButton block"
        onClick={() => setBackfillDate(toDateOnly(new Date()))}
      >
        {T.profile.scoreLog.backfill}
      </button>
      {error && <ApiErrorAlert error={error} />}
      {loading && !data && <p className="status empty">{T.loading}</p>}
      {data && years.length === 0 && (
        <p className="status empty">{T.profile.scoreLog.empty}</p>
      )}
      {year !== null && (
        <>
          <YearSwitcher
            year={year}
            older={years[yearIndex + 1] ?? null}
            newer={yearIndex > 0 ? years[yearIndex - 1] : null}
            onChange={setSelectedYear}
          />
          <div className="log-toolbar">
            <button
              type="button"
              onClick={() => updateCollapsed(months.map((month) => month.key))}
            >
              {T.profile.scoreLog.collapseAll}
            </button>
            <button type="button" onClick={() => updateCollapsed([])}>
              {T.profile.scoreLog.expandAll}
            </button>
          </div>
          {months.map((month) => (
            <LogGroup
              key={month.key}
              title={T.profile.scoreLog.month(month.month)}
              count={T.profile.scoreLog.count(month.count)}
              open={!collapsed.includes(month.key)}
              onToggle={() => toggle(month.key)}
            >
              <div className="log-table">
                {month.days.flatMap((day) =>
                  day.games.map((game) => (
                    <LogGameCard
                      key={game.id}
                      game={game}
                      day={day.day}
                      summary={scoreByGameId.get(game.id)}
                    />
                  )),
                )}
              </div>
            </LogGroup>
          ))}
        </>
      )}
      <button
        type="button"
        className="TrashLink block"
        onClick={() => router.push("/score-log/trash")}
      >
        {T.profile.scoreLog.trash}
      </button>
      {backfillDate !== null && (
        <Modal
          title={T.profile.scoreLog.backfillTitle}
          onClose={() => setBackfillDate(null)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setBackfillDate(null)}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!isBackfillDate(backfillDate)}
                onClick={() =>
                  router.push(`/game/setup?${BACKFILL_DATE_PARAM}=${backfillDate}`)
                }
              >
                {T.profile.scoreLog.backfillNext}
              </button>
            </>
          }
        >
          <Field
            label={T.profile.scoreLog.backfillDate}
            hint={T.game.backfillHint}
          >
            {(id) => (
              <input
                id={id}
                type="date"
                className="BackfillDate"
                max={toDateOnly(new Date())}
                value={backfillDate}
                onChange={(e) => setBackfillDate(e.target.value)}
              />
            )}
          </Field>
        </Modal>
      )}
      <BackButton />
    </div>
  );
}
