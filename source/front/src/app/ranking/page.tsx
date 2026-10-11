"use client";

import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import Picker from "@/components/Picker";
import Segment from "@/components/Segment";
import Link from "next/link";
import { useState } from "react";
import { useLoad } from "@/hooks/useLoad";
import { currentMonthRange, currentYearRange } from "@/lib/monthRange";
import { BOW_TYPES, DISTANCE_PRESETS_M, isBowType } from "@/lib/score/scoreConfig";
import { useT } from "@/lib/text";
import {
  RankingMetric,
  RankingQuery,
  listOrganizations,
  listUserRanking,
} from "@/lib/api";

type Period = "month" | "year" | "total";

const ALL = "";

const METRICS: ReadonlyArray<RankingMetric> = [
  "total_score",
  "average_round_score",
  "average_point_score",
];

const DISTANCE_OPTIONS = DISTANCE_PRESETS_M.map((distanceM) => ({
  value: String(distanceM),
  label: `${distanceM}m`,
}));

/** 月間は今月、年間は今年。トータルは期間を絞らない */
function periodRange(period: Period): { start?: string; end?: string } {
  if (period === "month") return currentMonthRange();
  if (period === "year") return currentYearRange();
  return {};
}

/** 合計は整数、平均は小数。平均ポイントは 1 本の点なので 1 ラウンドの平均より細かく出す */
function formatValue(metric: RankingMetric, value: number): string {
  if (metric === "total_score") return String(Math.round(value));
  return value.toFixed(metric === "average_point_score" ? 2 : 1);
}

export default function Page() {
  const T = useT();
  const PERIOD_OPTIONS = (["month", "year", "total"] as const).map((period) => ({
    value: period,
    label: T.stats.ranking.periodOption[period],
  }));
  const METRIC_OPTIONS = METRICS.map((metric) => ({
    value: metric,
    label: T.stats.ranking.metricOption[metric],
  }));
  const BOW_OPTIONS = [
    {
      value: ALL,
      label: T.all,
    },
    ...BOW_TYPES.map((bowType) => ({
      value: bowType.id as string,
      label: T.options.bowType[bowType.id],
    })),
  ];
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<RankingMetric>("total_score");
  const [bowType, setBowType] = useState(ALL);
  const [distance, setDistance] = useState(ALL);
  const [organizationId, setOrganizationId] = useState(ALL);
  const organizations = useLoad(listOrganizations, []).data ?? [];
  const { data, loading, error } = useLoad(() => {
    const query: RankingQuery = {
      metric,
      ...periodRange(period),
      bowType: isBowType(bowType) ? bowType : undefined,
      distanceM: distance === ALL ? undefined : Number(distance),
      organizationId: organizationId === ALL ? undefined : Number(organizationId),
    };
    return listUserRanking(query);
  }, [period, metric, bowType, distance, organizationId]);
  const rankings = data ?? [];

  return (
    <div className="page">
      <PageHeader title={T.stats.ranking.title} />
      <div className="panel stack RankingFilter">
        <div className="field">
          <span className="field-label">{T.stats.ranking.period}</span>
          <Segment
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            label={T.stats.ranking.period}
          />
        </div>
        <div className="field">
          <span className="field-label">{T.stats.ranking.metric}</span>
          <Segment
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
            label={T.stats.ranking.metric}
          />
        </div>
        <div className="field">
          <span className="field-label">{T.stats.ranking.bowType}</span>
          <Segment
            options={BOW_OPTIONS}
            value={bowType}
            onChange={setBowType}
            label={T.stats.ranking.bowType}
          />
        </div>
        <div className="toolbar">
          <Field label={T.stats.ranking.distance}>
            {(id) => (
              <Picker
                id={id}
                title={T.stats.ranking.distance}
                options={DISTANCE_OPTIONS}
                value={distance}
                onChange={setDistance}
                emptyLabel={T.all}
              />
            )}
          </Field>
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
        </div>
      </div>

      <p className="muted small">{T.stats.ranking.visibilityNote}</p>

      {error && <ApiErrorAlert error={error} />}

      {loading && <p className="status empty">{T.loading}</p>}

      {!loading && !error && rankings.length === 0 && <p className="status empty">{T.stats.ranking.empty}</p>}

      {!loading && !error && rankings.length > 0 && (
        <div className="row-list RankingList">
          {rankings.map((entry) => {
            const row = (
              <>
                <span className="rank">{entry.rank}</span>
                <div className="main">
                  <span>{entry.user.name}</span>
                </div>
                <div className="side">
                  <span className="big">
                    {formatValue(metric, entry.value)}
                    <span className="muted small">{T.stats.ranking.unit[metric]}</span>
                  </span>
                  <span className="muted small">{T.stats.ranking.rounds(entry.round_count)}</span>
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
      <BackButton />
    </div>
  );
}
