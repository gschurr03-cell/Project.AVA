import type {
  CoachingReport,
  CoachingComparisonReport,
  CoachingInsight,
  CoachingPriority,
  MetricComparison,
  MetricEvaluation,
  TechniqueScoreBreakdownItem,
} from "@/lib/coaching/types";

/**
 * Presentation only: renders a {@link CoachingReport} produced by the coaching
 * engine. All coaching logic lives in `@/lib/coaching`; this component performs
 * no metric analysis of its own and holds no client-side state.
 */

/** Badge colour by metric status (elite/good/watch/poor). */
const STATUS_BADGE: Record<string, string> = {
  elite: "bg-green-100 text-green-700",
  good: "bg-emerald-100 text-emerald-700",
  watch: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
};

/** Badge colour by insight severity (excellent/good/watch/poor). */
const SEVERITY_BADGE: Record<string, string> = {
  excellent: "bg-green-100 text-green-700",
  good: "bg-emerald-100 text-emerald-700",
  watch: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
};

/** Badge colour by priority impact (high/medium/low). */
const IMPACT_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

/** Badge colour by comparison direction (improved/declined/unchanged). */
const DIRECTION_BADGE: Record<string, string> = {
  improved: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  unchanged: "bg-gray-100 text-gray-600",
};

/** Human status text for a technique-score trend. */
const SCORE_STATUS_TEXT: Record<string, string> = {
  improved: "Improving",
  declined: "Needs attention",
  unchanged: "Stable",
};

const BADGE_BASE = "rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide";
const NEUTRAL_BADGE = "bg-gray-100 text-gray-600";

const formatNum = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
const formatDelta = (n: number): string => `${n > 0 ? "+" : ""}${formatNum(n)}`;

function EvidenceList({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-gray-400">
      {evidence.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function InsightPanel({
  report,
  comparison,
}: {
  report: CoachingReport;
  comparison?: CoachingComparisonReport | null;
}) {
  return (
    <section className="mt-6 space-y-6 rounded-lg border bg-gray-50 p-5">
      <h2 className="text-xl font-bold text-lane">AVA Coaching Report</h2>

      {/* Technique score */}
      <div className="rounded-lg border bg-white p-5 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Technique Score
        </p>
        <p className="mt-2 text-5xl font-bold text-lane">
          {report.techniqueScore}
          <span className="text-2xl font-semibold text-gray-400"> / 100</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-700">{report.techniqueLabel}</p>
      </div>

      {/* Score breakdown */}
      {report.techniqueBreakdown.length > 0 && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-base font-semibold text-gray-800">Score Breakdown</h3>
          <div className="space-y-2">
            {report.techniqueBreakdown.map((item: TechniqueScoreBreakdownItem) => (
              <div key={item.metricId} className="rounded border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-gray-800">{item.label}</p>
                  <div className="flex items-center gap-2">
                    <span className={`${BADGE_BASE} ${STATUS_BADGE[item.status] ?? NEUTRAL_BADGE}`}>
                      {item.status}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">
                      {item.points} / {item.maxPoints}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress since last session */}
      {comparison && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-gray-800">
            Progress Since Last Session
          </h3>

          <div className="rounded border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Technique Score:</span>{" "}
                {comparison.techniqueScore.previousScore} →{" "}
                {comparison.techniqueScore.currentScore}{" "}
                <span className="text-gray-500">
                  ({formatDelta(comparison.techniqueScore.delta)})
                </span>
              </p>
              <span
                className={`${BADGE_BASE} ${DIRECTION_BADGE[comparison.techniqueScore.direction] ?? NEUTRAL_BADGE}`}
              >
                {SCORE_STATUS_TEXT[comparison.techniqueScore.direction] ??
                  comparison.techniqueScore.direction}
              </span>
            </div>
          </div>

          {comparison.metrics.length > 0 && (
            <div className="mt-2 space-y-2">
              {comparison.metrics.map((metric: MetricComparison) => (
                <div key={metric.metricId} className="rounded border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{metric.label}:</span>{" "}
                      {formatNum(metric.previousValue)} → {formatNum(metric.currentValue)}{" "}
                      {metric.unit}{" "}
                      <span className="text-gray-500">
                        ({formatDelta(metric.delta)} {metric.unit})
                      </span>
                    </p>
                    <span
                      className={`${BADGE_BASE} ${DIRECTION_BADGE[metric.direction] ?? NEUTRAL_BADGE}`}
                    >
                      {metric.direction}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coach summary */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-base font-semibold text-gray-800">Coach Summary</h3>
        <p className="text-sm leading-relaxed text-gray-600">{report.summary}</p>
      </div>

      {/* Top priorities */}
      <div>
        <h3 className="mb-2 text-base font-semibold text-gray-800">Top Priorities</h3>
        {report.priorities.length === 0 ? (
          <p className="text-sm text-gray-500">No urgent priorities found.</p>
        ) : (
          <div className="space-y-3">
            {report.priorities.map((priority: CoachingPriority) => (
              <div key={priority.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">
                    <span className="mr-2 text-gray-400">#{priority.priority}</span>
                    {priority.title}
                  </p>
                  <span className={`${BADGE_BASE} ${IMPACT_BADGE[priority.impact] ?? NEUTRAL_BADGE}`}>
                    {priority.impact} impact
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium">Recommendation:</span> {priority.recommendation}
                </p>
                <EvidenceList evidence={priority.evidence} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detailed coaching */}
      <div>
        <h3 className="mb-2 text-base font-semibold text-gray-800">Detailed Coaching</h3>
        {report.insights.length === 0 ? (
          <p className="text-sm text-gray-500">No detailed insights were generated.</p>
        ) : (
          <div className="space-y-3">
            {report.insights.map((insight: CoachingInsight) => (
              <div key={insight.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">{insight.title}</p>
                  <span className={`${BADGE_BASE} ${SEVERITY_BADGE[insight.severity] ?? NEUTRAL_BADGE}`}>
                    {insight.severity}
                  </span>
                </div>
                <span className={`${BADGE_BASE} mt-2 inline-block ${NEUTRAL_BADGE}`}>
                  {insight.category}
                </span>
                <p className="mt-2 text-sm text-gray-600">{insight.explanation}</p>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium">Recommendation:</span> {insight.recommendation}
                </p>
                <EvidenceList evidence={insight.evidence} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw metric evaluations */}
      <div>
        <h3 className="mb-2 text-base font-semibold text-gray-800">Raw Metric Evaluations</h3>
        {report.metricEvaluations.length === 0 ? (
          <p className="text-sm text-gray-500">No metric evaluations available.</p>
        ) : (
          <div className="space-y-3">
            {report.metricEvaluations.map((metric: MetricEvaluation) => (
              <div key={metric.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">{metric.label}</p>
                  <span className={`${BADGE_BASE} ${STATUS_BADGE[metric.status] ?? NEUTRAL_BADGE}`}>
                    {metric.status}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-bold text-lane">
                  {metric.value}
                  <span className="ml-1 text-sm font-medium text-gray-400">{metric.unit}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  <span className="font-medium">Target:</span> {metric.targetRange}
                </p>
                <p className="mt-2 text-sm text-gray-600">{metric.meaning}</p>
                {metric.usedIn.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {metric.usedIn.map((use) => (
                      <span key={use} className={`${BADGE_BASE} ${NEUTRAL_BADGE} normal-case`}>
                        {use}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
