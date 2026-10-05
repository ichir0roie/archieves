"use client";

import PageHeader from "@/components/PageHeader";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import MonthRangeFilter from "@/components/MonthRangeFilter";
import Field from "@/components/Field";
import Picker from "@/components/Picker";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toIsoMonthBound } from "@/lib/monthRange";
import { T } from "@/lib/text";
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
      organizationId: organizationId === NO_ORGANIZATION ? undefined : Number(organizationId),
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
    <div className="page">
      <PageHeader title={T.stats.ranking.title} />
      <MonthRangeFilter
        startMonth={startMonth}
        endMonth={endMonth}
        onStartMonthChange={setStartMonth}
        onEndMonthChange={setEndMonth}
        onApply={handleApply}
        onReset={handleReset}
      >
        <Field label={T.stats.ranking.organization}>
          {(id) => (
            <Picker
              id={id}
              title={T.stats.ranking.organization}
              options={organizations.map((org) => ({
                value: String(org.id),
                label: org.name,
              }))}
              value={organizationId}
              onChange={setOrganizationId}
              emptyLabel={T.all}
            />
          )}
        </Field>
        <Field label={T.stats.ranking.region}>
          {(id) => (
            <input
              id={id}
              type="number"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            />
          )}
        </Field>
      </MonthRangeFilter>

      {error && <ApiErrorAlert error={error} />}

      {loading && <p className="status empty">{T.loading}</p>}

      {!loading && !error && rankings.length === 0 && <p className="status empty">{T.stats.ranking.empty}</p>}

      {!loading && !error && rankings.length > 0 && (
        <div className="row-list">
          {rankings.map((entry) => {
            const row = (
              <>
                <span className="rank">{entry.rank}</span>
                <div className="main">
                  <span>{entry.user.name}</span>
                </div>
                <div className="side">
                  <span className="big">{entry.average_score.toFixed(1)}</span>
                  <span className="muted small">
                    {entry.game_count}
                    {T.unit.game}
                  </span>
                </div>
              </>
            );

            return entry.user.sub ? (
              <Link
                key={entry.user.id}
                href={`/profile/${entry.user.sub}`}
              >
                {row}
              </Link>
            ) : (
              <div key={entry.user.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
