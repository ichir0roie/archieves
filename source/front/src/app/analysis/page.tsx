"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import { useLoad } from "@/hooks/useLoad";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import MonthRangeFilter from "@/components/MonthRangeFilter";
import StatSummaryCard from "@/components/StatSummaryCard";
import ScoreTrendChart, { type TrendPoint } from "@/components/ScoreTrendChart";
import Field from "@/components/Field";
import Picker from "@/components/Picker";
import Segment from "@/components/Segment";
import {
  RangePreset,
  presetRange,
  toIsoMonthBound,
} from "@/lib/monthRange";
import { useT } from "@/lib/text";
import {
  EndScoreSummary,
  GameKindOptions,
  ScoreStatistics,
  RoundScoreSummary,
  StatisticsQuery,
  getEndScoreStatistics,
  getGameKindOptions,
  getPointScoreStatistics,
  getRoundScoreStatistics,
  listEndScores,
  listRoundScores,
} from "@/lib/api";

type DashboardData = {
  roundStats: ScoreStatistics;
  endStats: ScoreStatistics;
  pointStats: ScoreStatistics;
  rounds: RoundScoreSummary[];
  ends: EndScoreSummary[];
};

type Axis = "round" | "end" | "point";

type KindKey = "bowType" | "distance" | "targetType" | "endSize" | "roundSize" | "gameSize";

/** 種別の絞り込み。"" はすべて */
type Kind = Record<KindKey, string>;

const ALL = "";

const KIND_KEYS: ReadonlyArray<KindKey> = [
  "bowType",
  "distance",
  "targetType",
  "endSize",
  "roundSize",
  "gameSize",
];

const NO_KIND: Kind = {
  bowType: ALL,
  distance: ALL,
  targetType: ALL,
  endSize: ALL,
  roundSize: ALL,
  gameSize: ALL,
};

function toNumber(value: string): number | undefined {
  return value === ALL ? undefined : Number(value);
}

function kindQuery(kind: Kind): StatisticsQuery {
  return {
    bowType: kind.bowType || undefined,
    distanceM: toNumber(kind.distance),
    targetType: kind.targetType || undefined,
    endSize: toNumber(kind.endSize),
    roundSize: toNumber(kind.roundSize),
    gameSize: toNumber(kind.gameSize),
  };
}

/**
 * 日ごとの平均。ゲームごとの合計だとラウンド数・エンド数の違いで値が飛ぶので、
 * 1 ラウンド・1 エンド・1 本あたりに均して並べる。
 */
function dailyTrend(axis: Axis, rounds: RoundScoreSummary[], ends: EndScoreSummary[]): TrendPoint[] {
  const byDate = new Map<string, { sum: number; denominator: number; count: number }>();
  const add = (date: string, sum: number, denominator: number) => {
    const acc = byDate.get(date) ?? { sum: 0, denominator: 0, count: 0 };
    acc.sum += sum;
    acc.denominator += denominator;
    acc.count += 1;
    byDate.set(date, acc);
  };
  if (axis === "end") {
    ends.forEach((e) => add(e.recorded_at, e.total_score, 1));
  } else if (axis === "round") {
    rounds.forEach((r) => add(r.recorded_at, r.total_score, 1));
  } else {
    // 1 本平均は本数で重みを付ける(本数の少ないラウンドに引っ張られない)
    rounds.filter((r) => r.arrow_count > 0).forEach((r) => add(r.recorded_at, r.total_score, r.arrow_count));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => ({
      date,
      value: acc.sum / acc.denominator,
      count: acc.count,
    }));
}

export default function Page() {
  const T = useT();
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<StatisticsQuery>({});
  const [preset, setPreset] = useState<RangePreset | "custom">("all");
  const [axis, setAxis] = useState<Axis>("round");
  const [kind, setKind] = useState<Kind>(NO_KIND);
  const { data: kindOptions } = useLoad<GameKindOptions>(() => getGameKindOptions(), []);
  const { data, loading, error } = useLoad<DashboardData>(async () => {
    const query = {
      ...appliedQuery,
      ...kindQuery(kind),
    };
    const [roundStats, endStats, pointStats, rounds, ends] = await Promise.all([
      getRoundScoreStatistics(query),
      getEndScoreStatistics(query),
      getPointScoreStatistics(query),
      listRoundScores(query),
      listEndScores(query),
    ]);
    return { roundStats, endStats, pointStats, rounds, ends };
  }, [appliedQuery, kind]);

  const AXIS_OPTIONS = (["round", "end", "point"] as const).map((value) => ({
    value,
    label: T.stats.analysis.axisOption[value],
  }));

  function kindPickerOptions(key: KindKey): { value: string; label: string }[] {
    if (!kindOptions) return [];
    switch (key) {
      case "bowType":
        return kindOptions.bow_types.map((v) => ({ value: v, label: T.options.bowType[v] ?? v }));
      case "distance":
        return kindOptions.distances_m.map((v) => ({ value: String(v), label: `${v}m` }));
      case "targetType":
        return kindOptions.target_types.map((v) => ({ value: v, label: T.options.targetType[v] ?? v }));
      case "endSize":
        return kindOptions.end_sizes.map((v) => ({ value: String(v), label: String(v) }));
      case "roundSize":
        return kindOptions.round_sizes.map((v) => ({ value: String(v), label: String(v) }));
      case "gameSize":
        return kindOptions.game_sizes.map((v) => ({ value: String(v), label: String(v) }));
    }
  }

  function handlePreset(next: RangePreset) {
    setPreset(next);
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery(presetRange(next));
  }

  function handleCustom() {
    setPreset("custom");
  }

  function handleApply() {
    setAppliedQuery({
      start: toIsoMonthBound(startMonth, "start"),
      end: toIsoMonthBound(endMonth, "end"),
    });
  }

  function handleReset() {
    setPreset("all");
    setStartMonth("");
    setEndMonth("");
    setAppliedQuery({});
  }

  return (
    <div className="page wide">
      <PageHeader title={T.stats.analysis.title} />
      <div
        className="toolbar"
        role="group"
        aria-label={T.stats.analysis.presetLabel}
      >
        {(["year", "month", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={preset === key ? "primary" : undefined}
            aria-pressed={preset === key}
            onClick={() => handlePreset(key)}
          >
            {T.stats.analysis.preset[key]}
          </button>
        ))}
        <button
          type="button"
          className={preset === "custom" ? "primary" : undefined}
          aria-pressed={preset === "custom"}
          onClick={handleCustom}
        >
          {T.stats.analysis.preset.custom}
        </button>
      </div>
      {preset === "custom" && (
        <MonthRangeFilter
          startMonth={startMonth}
          endMonth={endMonth}
          onStartMonthChange={setStartMonth}
          onEndMonthChange={setEndMonth}
          onApply={handleApply}
          onReset={handleReset}
        />
      )}

      <div className="toolbar">
        {KIND_KEYS.map((key) => (
          <Field
            key={key}
            label={T.stats.analysis.kind[key]}
          >
            {(id) => (
              <Picker
                id={id}
                title={T.stats.analysis.kind[key]}
                options={kindPickerOptions(key)}
                value={kind[key]}
                onChange={(value) => setKind((prev) => ({ ...prev, [key]: value }))}
                emptyLabel={T.all}
              />
            )}
          </Field>
        ))}
      </div>

      {loading && <p className="status empty">{T.loading}</p>}

      {error && <ApiErrorAlert error={error} />}

      {!loading && !error && data && (
        <>
          <div className="cards">
            <StatSummaryCard
              title={T.stats.card.round}
              unit={T.unit.point}
              stats={data.roundStats}
            />
            <StatSummaryCard
              title={T.stats.card.end}
              unit={T.unit.point}
              stats={data.endStats}
            />
            <StatSummaryCard
              title={T.stats.card.point}
              unit={T.unit.point}
              stats={data.pointStats}
            />
          </div>

          <div className="field">
            <span className="field-label">{T.stats.analysis.axis}</span>
            <Segment
              options={AXIS_OPTIONS}
              value={axis}
              onChange={setAxis}
              label={T.stats.analysis.axis}
            />
          </div>
          <ScoreTrendChart
            points={dailyTrend(axis, data.rounds, data.ends)}
            axisLabel={T.stats.analysis.axisOption[axis]}
          />
        </>
      )}
      <BackButton />
    </div>
  );
}
