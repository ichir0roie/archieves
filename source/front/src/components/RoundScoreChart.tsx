import { RoundScoreSummary } from "@/lib/api";
import { T } from "@/lib/text";

type Props = {
  rounds: RoundScoreSummary[];
};

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 340;
const PADDING = { top: 20, right: 30, bottom: 56, left: 52 };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return T.none;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export default function RoundScoreChart({ rounds }: Props) {
  if (rounds.length === 0) {
    return <p className="status empty">{T.stats.chart.empty}</p>;
  }

  const maxScore = Math.max(...rounds.map((r) => r.total_score), 1);
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(maxScore)) - 1)) || 1;
  const axisMax = Math.ceil(maxScore / step) * step;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(axisMax * f));

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const points = rounds.map((round, index) => {
    const x = PADDING.left + (rounds.length === 1 ? innerWidth / 2 : (index / (rounds.length - 1)) * innerWidth);
    const y = PADDING.top + (1 - round.total_score / (axisMax || 1)) * innerHeight;
    return { ...round, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");

  return (
    <div className="panel chart">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={T.stats.chart.ariaLabel}
      >
        {gridLines.map((value) => {
          const y = PADDING.top + (1 - value / (axisMax || 1)) * innerHeight;
          return (
            <g key={value}>
              <line
                className="grid"
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text
                className="label"
                x={PADDING.left - 8}
                y={y + 4}
                textAnchor="end"
              >
                {value}
              </text>
            </g>
          );
        })}

        <line
          className="axis"
          x1={PADDING.left}
          x2={CHART_WIDTH - PADDING.right}
          y1={CHART_HEIGHT - PADDING.bottom}
          y2={CHART_HEIGHT - PADDING.bottom}
        />

        <path
          className="line"
          d={linePath}
        />

        {points.map((point) => (
          <circle
            key={point.round_id}
            className="dot"
            cx={point.x}
            cy={point.y}
            r={4}
          >
            <title>
              {T.stats.chart.pointTitle(
                point.number,
                formatDate(point.recorded_at),
                point.total_score,
                point.average_score !== null ? point.average_score.toFixed(1) : T.none,
              )}
            </title>
          </circle>
        ))}

        {points.map((point, index) => {
          const isVisible =
            index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0;
          if (!isVisible) return null;

          return (
            <text
              key={`${point.round_id}-label`}
              className="label"
              x={point.x}
              y={CHART_HEIGHT - PADDING.bottom + 18}
              textAnchor="middle"
            >
              {formatDate(point.recorded_at)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
