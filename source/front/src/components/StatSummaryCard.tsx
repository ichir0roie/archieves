import { ScoreStatistics } from "@/lib/api";
import { useT, type Texts } from "@/lib/text";

type Props = {
  title: string;
  unit: string;
  stats: ScoreStatistics | null;
};

function formatNumber(T: Texts, value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return T.none;
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function StatSummaryCard({ title, unit, stats }: Props) {
  const T = useT();
  const metrics = [
    { label: T.stats.metric.min, value: formatNumber(T, stats?.min ?? null) },
    { label: T.stats.metric.max, value: formatNumber(T, stats?.max ?? null) },
    { label: T.stats.metric.median, value: formatNumber(T, stats?.median ?? null) },
    { label: T.stats.metric.count, value: stats ? String(stats.count) : T.none },
  ];

  return (
    <div className="panel stat-card">
      <div className="section-label">{title}</div>
      <div className="body">
        <div className="average">
          <span className="value">{formatNumber(T, stats?.average ?? null)}</span>
          <span className="muted small">{T.stats.averageUnit(unit)}</span>
        </div>
        <div className="metrics">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="metric"
            >
              <span className="label">{m.label}</span>
              <span>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
