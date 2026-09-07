"use client";

import AuthGate from "@/components/auth/AuthGate";
import Header from "@/components/templates/common/header";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import MonthRangeFilter from "@/components/templates/common/MonthRangeFilter";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MenuItem,
  TextField,
} from "@mui/material";
import { toIsoMonthBound } from "@/lib/date/monthRange";
import {
  OrganizationRead,
  RankingQuery,
  UserRanking,
  listOrganizations,
  listUserRanking,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";

const NO_ORGANIZATION = "";

export default function Page() {
  const [organizations, setOrganizations] = useState<OrganizationRead[]>([]);
  const [organizationId, setOrganizationId] = useState<string>(NO_ORGANIZATION);
  const [regionId, setRegionId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<RankingQuery>({});
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    listOrganizations().then(setOrganizations).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listUserRanking(appliedQuery);
        if (!cancelled) setRankings(data);
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
  }, [appliedQuery]);

  function handleApply() {
    setAppliedQuery({
      organizationId:
        organizationId === NO_ORGANIZATION ? undefined : Number(organizationId),
      regionId: regionId === "" ? undefined : Number(regionId),
      start: toIsoMonthBound(startMonth, "start"),
      end: toIsoMonthBound(endMonth, "end"),
    });
  }

  function handleReset() {
    setOrganizationId(NO_ORGANIZATION);
    setRegionId("");
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery({});
  }

  return (
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="ランキング" />
        <div className="flex w-full flex-col gap-3 p-3 max-w-2xl mx-auto">
          <MonthRangeFilter
            startMonth={startMonth}
            endMonth={endMonth}
            onStartMonthChange={setStartMonth}
            onEndMonthChange={setEndMonth}
            onApply={handleApply}
            onReset={handleReset}
          >
            <TextField
              size="small"
              select
              label="所属"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="w-40"
            >
              <MenuItem value={NO_ORGANIZATION}>すべて</MenuItem>
              {organizations.map((org) => (
                <MenuItem key={org.id} value={String(org.id)}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label="地域ID"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="w-32"
            />
          </MonthRangeFilter>

          {error && <ApiErrorAlert error={error} />}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          )}

          {!loading && !error && rankings.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              該当するデータがありません
            </div>
          )}

          {!loading && !error && rankings.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
              {rankings.map((entry) => {
                const row = (
                  <>
                    <span className="w-8 text-center text-sm font-bold text-slate-500">
                      {entry.rank}
                    </span>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold text-slate-800">
                        {entry.user.name}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-lg font-bold text-slate-900">
                        {entry.average_score.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {entry.game_count}ゲーム
                      </span>
                    </div>
                  </>
                );

                return entry.user.sub ? (
                  <Link
                    key={entry.user.id}
                    href={`/profile/${entry.user.sub}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"
                  >
                    {row}
                  </Link>
                ) : (
                  <div
                    key={entry.user.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                  >
                    {row}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AuthGate>
  );
}
