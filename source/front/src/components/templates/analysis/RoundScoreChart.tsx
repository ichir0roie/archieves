import { RoundScoreSummary } from "@/lib/api";

interface Props {
  rounds: RoundScoreSummary[];
}

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 340;
const PADDING = { top: 20, right: 30, bottom: 56, left: 52 };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export default function RoundScoreChart({ rounds }: Props) {
  if (rounds.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-sm text-slate-500">
        表示できるラウンドがありません
      </div>
    );
  }

  const maxScore = Math.max(...rounds.map((r) => r.total_score), 1);
  const step =
    Math.pow(10, Math.max(0, Math.floor(Math.log10(maxScore)) - 1)) || 1;
  const axisMax = Math.ceil(maxScore / step) * step;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(axisMax * f));

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const points = rounds.map((round, index) => {
    const x =
      PADDING.left +
      (rounds.length === 1
        ? innerWidth / 2
        : (index / (rounds.length - 1)) * innerWidth);
    const y =
      PADDING.top + (1 - round.total_score / (axisMax || 1)) * innerHeight;
    return { ...round, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
      <div
        className="w-full"
        style={{ aspectRatio: `${CHART_WIDTH} / ${CHART_HEIGHT}` }}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label="ラウンドごとの合計点の推移を示す線グラフ"
        >
          {gridLines.map((value) => {
            const y = PADDING.top + (1 - value / (axisMax || 1)) * innerHeight;
            return (
              <g key={value}>
                <line
                  x1={PADDING.left}
                  x2={CHART_WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="#64748b"
                >
                  {value}
                </text>
              </g>
            );
          })}

          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={CHART_HEIGHT - PADDING.bottom}
            y2={CHART_HEIGHT - PADDING.bottom}
            stroke="#cbd5e1"
            strokeWidth={1}
          />

          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((point) => (
            <g key={point.round_id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={4}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={2}
              >
                <title>
                  {`ラウンド${point.number}（${formatDate(
                    point.recorded_at,
                  )}）\n合計: ${point.total_score}点 / 平均: ${
                    point.average_score !== null
                      ? point.average_score.toFixed(1)
                      : "-"
                  }点`}
                </title>
              </circle>
            </g>
          ))}

          {points.map((point, index) => {
            const isVisible =
              index === 0 ||
              index === points.length - 1 ||
              index % Math.max(1, Math.ceil(points.length / 6)) === 0;
            if (!isVisible) return null;

            return (
              <text
                key={`${point.round_id}-label`}
                x={point.x}
                y={CHART_HEIGHT - PADDING.bottom + 18}
                textAnchor="middle"
                fontSize={10}
                fill="#64748b"
              >
                {formatDate(point.recorded_at)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
