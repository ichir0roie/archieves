import { ScoreStatistics } from "@/lib/api";

interface Props {
  title: string;
  unit: string;
  stats: ScoreStatistics | null;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function StatSummaryCard({ title, unit, stats }: Props) {
  const metrics = [
    { label: "最小", value: formatNumber(stats?.min ?? null) },
    { label: "最大", value: formatNumber(stats?.max ?? null) },
    { label: "中央値", value: formatNumber(stats?.median ?? null) },
    { label: "件数", value: stats ? String(stats.count) : "-" },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-slate-900">
            {formatNumber(stats?.average ?? null)}
          </span>
          <span className="text-sm font-medium text-slate-500">
            平均{unit}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1"
            >
              <span className="text-[11px] font-semibold text-slate-500">
                {m.label}
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
