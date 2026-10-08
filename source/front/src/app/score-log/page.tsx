"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import LogGameCard from "@/components/LogGameCard";
import LogGroup from "@/components/LogGroup";
import PageHeader from "@/components/PageHeader";
import { listGames } from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import {
  allGroupKeys,
  groupGamesByDate,
  NO_DATE_KEY,
} from "@/lib/scoreLogGroups";
import { loadScoreLogCollapsed, saveScoreLogCollapsed } from "@/lib/storage";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const { data, loading, error } = useLoad(async () => {
    const { id: userId } = await getCurrentAppUser();
    return listGames(userId);
  }, []);
  const games = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupGamesByDate(games), [games]);
  const [collapsed, setCollapsed] = useState<Array<string>>([]);

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

  function cards(list: typeof games) {
    return (
      <div className="ScoreLog row-list">
        {list.map((game) => (
          <LogGameCard key={game.id} game={game} />
        ))}
      </div>
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
      {error && <ApiErrorAlert error={error} />}
      {loading && <p className="status empty">{T.loading}</p>}
      {!loading && !error && games.length === 0 && (
        <p className="status empty">{T.profile.scoreLog.empty}</p>
      )}
      {games.length > 0 && (
        <>
          <div className="log-toolbar">
            <button
              type="button"
              onClick={() => updateCollapsed(allGroupKeys(groups))}
            >
              {T.profile.scoreLog.collapseAll}
            </button>
            <button type="button" onClick={() => updateCollapsed([])}>
              {T.profile.scoreLog.expandAll}
            </button>
          </div>
          {groups.years.map((year) => (
            <LogGroup
              key={year.key}
              level="year"
              title={T.profile.scoreLog.year(year.year)}
              count={T.profile.scoreLog.count(year.count)}
              open={!collapsed.includes(year.key)}
              onToggle={() => toggle(year.key)}
            >
              {year.months.map((month) => (
                <LogGroup
                  key={month.key}
                  level="month"
                  title={T.profile.scoreLog.month(month.month)}
                  count={T.profile.scoreLog.count(month.count)}
                  open={!collapsed.includes(month.key)}
                  onToggle={() => toggle(month.key)}
                >
                  {month.days.map((day) => (
                    <LogGroup
                      key={day.key}
                      level="day"
                      title={T.profile.scoreLog.day(day.day)}
                      count={T.profile.scoreLog.count(day.games.length)}
                      open={!collapsed.includes(day.key)}
                      onToggle={() => toggle(day.key)}
                    >
                      {cards(day.games)}
                    </LogGroup>
                  ))}
                </LogGroup>
              ))}
            </LogGroup>
          ))}
          {groups.undated.length > 0 && (
            <LogGroup
              level="year"
              title={T.profile.scoreLog.noDate}
              count={T.profile.scoreLog.count(groups.undated.length)}
              open={!collapsed.includes(NO_DATE_KEY)}
              onToggle={() => toggle(NO_DATE_KEY)}
            >
              {cards(groups.undated)}
            </LogGroup>
          )}
        </>
      )}
    </div>
  );
}
