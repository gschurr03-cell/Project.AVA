import {
  formatMetricValue,
  type AnalysisMetrics,
} from "@/lib/biomechanics/types";
import type {
  CoachingReport,
  InsightSeverity,
  MetricStatus,
} from "@/lib/coaching/types";

/** One athlete's data for the comparison: metrics plus its coaching report. */
export type ComparisonMetricsSide = {
  label?: string;
  metrics: AnalysisMetrics;
  /** Already-generated coaching report; drives the strengths/weaknesses summary. */
  report?: CoachingReport | null;
};

type Props = {
  left: ComparisonMetricsSide;
  right: ComparisonMetricsSide;
};

/** Which direction is "better" for a metric (drives the Δ colour). */
type Direction = "lower" | "higher" | "neutral";

type MetricRow = {
  key: keyof AnalysisMetrics;
  label: string;
  unit: string;
  decimals: number;
  direction: Direction;
  /** Worker emits 0 as a placeholder for these until calibrated. */
  placeholderWhenZero?: boolean;
};

// Ordered per the panel spec. Only metrics with an unambiguous better-direction
// are coloured; the rest show a neutral Δ.
const METRIC_ROWS: MetricRow[] = [
  { key: "groundContactTimeMs", label: "Ground Contact", unit: "ms", decimals: 0, direction: "lower" },
  { key: "flightTimeMs", label: "Flight Time", unit: "ms", decimals: 0, direction: "neutral" },
  { key: "strideFrequencyHz", label: "Stride Frequency", unit: "Hz", decimals: 2, direction: "higher" },
  { key: "peakKneeFlexionDeg", label: "Peak Knee Flexion", unit: "°", decimals: 1, direction: "neutral" },
  { key: "avgTrunkLeanDeg", label: "Trunk Lean", unit: "°", decimals: 1, direction: "neutral" },
  {
    key: "topSpeedMps",
    label: "Top Speed",
    unit: "m/s",
    decimals: 2,
    direction: "higher",
    placeholderWhenZero: true,
  },
  {
    key: "avgStrideLengthM",
    label: "Stride Length",
    unit: "m",
    decimals: 2,
    direction: "neutral",
    placeholderWhenZero: true,
  },
];

const STATUS_RANK: Record<MetricStatus, number> = { elite: 3, good: 2, watch: 1, poor: 0 };
const SEVERITY_RANK: Record<InsightSeverity, number> = { poor: 3, watch: 2, good: 1, excellent: 0 };

const MAX_SUMMARY_ITEMS = 4;
const MAX_DIFFERENCES = 3;

function isAvailable(row: MetricRow, value: number): boolean {
  return Number.isFinite(value) && !(row.placeholderWhenZero && value <= 0);
}

function withUnit(text: string, unit: string): string {
  return unit === "°" ? `${text}°` : `${text} ${unit}`;
}

function formatMetric(row: MetricRow, value: number): string {
  return withUnit(formatMetricValue(value, row.decimals), row.unit);
}

function formatDelta(row: MetricRow, delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return withUnit(`${sign}${formatMetricValue(delta, row.decimals)}`, row.unit);
}

/** Δ is right − left; colour by whether that helps the right athlete. */
function deltaClass(row: MetricRow, delta: number): string {
  if (row.direction === "neutral" || delta === 0) return "text-gray-500";
  const rightIsBetter = row.direction === "lower" ? delta < 0 : delta > 0;
  return rightIsBetter ? "text-green-600" : "text-red-600";
}

/** Metric labels the engine rated elite/good for this athlete. */
function strengthsFrom(report: CoachingReport | null | undefined): string[] {
  if (!report) return [];
  return report.metricEvaluations
    .filter((evaluation) => evaluation.status === "elite" || evaluation.status === "good")
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])
    .slice(0, MAX_SUMMARY_ITEMS)
    .map((evaluation) => evaluation.label);
}

/** Weaknesses from the coaching insights (watch/poor), worst first. */
function weaknessesFrom(report: CoachingReport | null | undefined): string[] {
  if (!report) return [];
  const flagged = report.insights
    .filter((insight) => insight.severity === "watch" || insight.severity === "poor")
    .sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.priority - b.priority,
    )
    .map((insight) => insight.title);
  if (flagged.length) return flagged.slice(0, MAX_SUMMARY_ITEMS);

  // Fall back to metric evaluations the engine rated watch/poor.
  return report.metricEvaluations
    .filter((evaluation) => evaluation.status === "watch" || evaluation.status === "poor")
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    .slice(0, MAX_SUMMARY_ITEMS)
    .map((evaluation) => evaluation.label);
}

type Difference = {
  row: MetricRow;
  leftValue: number;
  rightValue: number;
  delta: number;
};

/** Metrics with the largest relative gap between the two athletes. */
function biggestDifferences(left: AnalysisMetrics, right: AnalysisMetrics): Difference[] {
  return METRIC_ROWS.map((row) => {
    const leftValue = left[row.key];
    const rightValue = right[row.key];
    if (!isAvailable(row, leftValue) || !isAvailable(row, rightValue)) return null;
    const denominator = (Math.abs(leftValue) + Math.abs(rightValue)) / 2 || 1;
    const relative = Math.abs(leftValue - rightValue) / denominator;
    return { row, leftValue, rightValue, delta: rightValue - leftValue, relative };
  })
    .filter((diff): diff is Difference & { relative: number } => diff !== null && diff.relative > 0)
    .sort((a, b) => b.relative - a.relative)
    .slice(0, MAX_DIFFERENCES)
    .map(({ row, leftValue, rightValue, delta }) => ({ row, leftValue, rightValue, delta }));
}

function AthleteSummary({ side, accent }: { side: ComparisonMetricsSide; accent: string }) {
  const label = side.label ?? "Athlete";
  const strengths = strengthsFrom(side.report);
  const weaknesses = weaknessesFrom(side.report);

  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="font-semibold text-gray-800">
          <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${accent}`} aria-hidden />
          {label}
        </h4>
        {side.report && (
          <span className="text-xs text-gray-500">
            Technique{" "}
            <span className="font-semibold text-gray-800">{side.report.techniqueScore}</span> ·{" "}
            {side.report.techniqueLabel}
          </span>
        )}
      </div>

      {!side.report ? (
        <p className="text-sm text-gray-500">No coaching report available.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-700">
              Strengths
            </p>
            {strengths.length ? (
              <ul className="space-y-0.5">
                {strengths.map((item) => (
                  <li key={item} className="text-gray-700">
                    <span className="mr-1 text-green-600">▲</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">None flagged.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-700">
              Weaknesses
            </p>
            {weaknesses.length ? (
              <ul className="space-y-0.5">
                {weaknesses.map((item) => (
                  <li key={item} className="text-gray-700">
                    <span className="mr-1 text-red-600">▼</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">None flagged.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Side-by-side biomechanics comparison of two athletes: a per-metric table with
 * a coloured Δ column, plus an auto-generated summary (strengths, weaknesses,
 * and the biggest differences) derived from the already-computed coaching
 * reports — no AI call. Pure presentation; safe to render anywhere.
 */
export default function ComparisonMetricsPanel({ left, right }: Props) {
  const leftLabel = left.label ?? "Athlete A";
  const rightLabel = right.label ?? "Athlete B";
  const differences = biggestDifferences(left.metrics, right.metrics);

  return (
    <section className="space-y-6 rounded-xl border bg-white p-4">
      <h3 className="text-lg font-semibold text-gray-800">Comparison Analytics</h3>

      {/* Metric table with Δ column */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-4 font-medium">Metric</th>
              <th className="py-2 pr-4 text-right font-medium">{leftLabel}</th>
              <th className="py-2 pr-4 text-right font-medium">{rightLabel}</th>
              <th className="py-2 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => {
              const leftValue = left.metrics[row.key];
              const rightValue = right.metrics[row.key];
              const leftAvailable = isAvailable(row, leftValue);
              const rightAvailable = isAvailable(row, rightValue);
              const bothAvailable = leftAvailable && rightAvailable;
              const delta = rightValue - leftValue;

              return (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-gray-700">{row.label}</td>
                  <td className="py-2 pr-4 text-right font-mono text-gray-900">
                    {leftAvailable ? formatMetric(row, leftValue) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-gray-900">
                    {rightAvailable ? formatMetric(row, rightValue) : "—"}
                  </td>
                  <td className={`py-2 text-right font-mono ${bothAvailable ? deltaClass(row, delta) : "text-gray-400"}`}>
                    {bothAvailable ? formatDelta(row, delta) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Auto-generated summary */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <AthleteSummary side={left} accent="bg-lane" />
          <AthleteSummary side={right} accent="bg-amber-400" />
        </div>

        <div className="rounded-lg border bg-gray-50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Biggest biomechanical differences
          </p>
          {differences.length ? (
            <ul className="space-y-1 text-sm">
              {differences.map(({ row, leftValue, rightValue, delta }) => (
                <li key={row.key} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-gray-800">{row.label}:</span>
                  <span className="font-mono text-gray-600">
                    {leftLabel} {formatMetric(row, leftValue)} vs {rightLabel}{" "}
                    {formatMetric(row, rightValue)}
                  </span>
                  <span className={`font-mono ${deltaClass(row, delta)}`}>
                    (Δ {formatDelta(row, delta)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Not enough comparable metrics to highlight differences.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
