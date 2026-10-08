import { useT, type Texts } from "@/lib/text";

/** グラフの 1 点。`value` はその日の平均、`count` は平均を取った件数。 */
export type TrendPoint = {
  date: string;
  value: number;
  count: number;
};

type Props = {
  points: TrendPoint[];
  /** 軸の名前(「ラウンド平均」など)。読み上げに使う */
  axisLabel: string;
};

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 340;
const PADDING = { top: 20, right: 30, bottom: 56, left: 52 };

function formatDate(T: Texts, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return T.none;
  return new Intl.DateTimeFormat(T.intlLocale, {
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export default function ScoreTrendChart({ points: series, axisLabel }: Props) {
  const T = useT();
  if (series.length === 0) {
    return <p className="status empty">{T.stats.chart.empty}</p>;
  }

  const maxScore = Math.max(...series.map((p) => p.value), 1);
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(maxScore)) - 1)) || 1;
  // 4 等分の目盛りが step の倍数(整数)になるよう、上限を 4 * step の倍数にする
  const axisMax = Math.ceil(maxScore / (4 * step)) * 4 * step;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => axisMax * f);

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const points = series.map((point, index) => {
    const x = PADDING.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
    const y = PADDING.top + (1 - point.value / (axisMax || 1)) * innerHeight;
    return { ...point, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");

  return (
    <div className="panel chart">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={T.stats.chart.ariaLabel(axisLabel)}
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
            key={point.date}
            className="dot"
            cx={point.x}
            cy={point.y}
            r={4}
          >
            <title>
              {T.stats.chart.pointTitle(
                formatDate(T, point.date),
                point.value.toFixed(1),
                point.count,
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
              key={`${point.date}-label`}
              className="label"
              x={point.x}
              y={CHART_HEIGHT - PADDING.bottom + 18}
              textAnchor="middle"
            >
              {formatDate(T, point.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
