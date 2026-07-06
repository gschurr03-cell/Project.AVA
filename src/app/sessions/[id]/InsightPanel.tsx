import { AvaPanel } from "@/components/ava/AvaPanel";
import { AVA_BADGE, type AvaTone } from "@/lib/design/ava";
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
 *
 * Status meaning maps onto the AVA medal system: gold (elite/excellent/improved),
 * silver (good), bronze (watch), red-alert (poor/declined — a performance status,
 * not brand red), gray (neutral/unchanged). High impact/urgency also uses alert.
 */

/** Metric-status tone (elite/good/watch/poor). */
const STATUS_TONE: Record<string, AvaTone> = {
  elite: "gold",
  good: "silver",
  watch: "bronze",
  poor: "alert",
};

/** Insight-severity tone (excellent/good/watch/poor). */
const SEVERITY_TONE: Record<string, AvaTone> = {
  excellent: "gold",
  good: "silver",
  watch: "bronze",
  poor: "alert",
};

/** Priority-impact/urgency tone (high/medium/low). */
const IMPACT_TONE: Record<string, AvaTone> = {
  high: "alert",
  medium: "bronze",
  low: "gray",
};

/** Comparison-direction tone (improved/declined/unchanged). */
const DIRECTION_TONE: Record<string, AvaTone> = {
  improved: "gold",
  declined: "alert",
  unchanged: "gray",
};

/** Human status text for a technique-score trend. */
const SCORE_STATUS_TEXT: Record<string, string> = {
  improved: "Improving",
  declined: "Needs attention",
  unchanged: "Stable",
};

const BADGE_BASE = "rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide";
const NEUTRAL_BADGE = AVA_BADGE.gray;
const badge = (tone: AvaTone | undefined) => AVA_BADGE[tone ?? "gray"];

const formatNum = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
const formatDelta = (n: number): string => `${n > 0 ? "+" : ""}${formatNum(n)}`;

function EvidenceList({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[#6B7280]">
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
    <AvaPanel eyebrow="AVA Coaching" title="Coaching Report">
      <div className="space-y-6">
        {/* Technique score */}
        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Technique Score
          </p>
          <p className="mt-2 text-5xl font-bold text-[#F5F5F7]">
            {report.techniqueScore}
            <span className="text-2xl font-semibold text-[#6B7280]"> / 100</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-[#A0A2A8]">{report.techniqueLabel}</p>
        </div>

        {/* Score breakdown */}
        {report.techniqueBreakdown.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
            <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Score Breakdown</h3>
            <div className="space-y-2">
              {report.techniqueBreakdown.map((item: TechniqueScoreBreakdownItem) => (
                <div key={item.metricId} className="rounded-lg border border-white/[0.06] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-[#F5F5F7]">{item.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={`${BADGE_BASE} ${badge(STATUS_TONE[item.status])}`}>
                        {item.status}
                      </span>
                      <span className="text-sm font-semibold text-[#A0A2A8]">
                        {item.points} / {item.maxPoints}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[#6B7280]">{item.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress since last session */}
        {comparison && (
          <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
            <h3 className="mb-3 text-base font-semibold text-[#F5F5F7]">
              Progress Since Last Session
            </h3>

            <div className="rounded-lg border border-white/[0.06] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-[#A0A2A8]">
                  <span className="font-medium text-[#F5F5F7]">Technique Score:</span>{" "}
                  {comparison.techniqueScore.previousScore} →{" "}
                  {comparison.techniqueScore.currentScore}{" "}
                  <span className="text-[#6B7280]">
                    ({formatDelta(comparison.techniqueScore.delta)})
                  </span>
                </p>
                <span className={`${BADGE_BASE} ${badge(DIRECTION_TONE[comparison.techniqueScore.direction])}`}>
                  {SCORE_STATUS_TEXT[comparison.techniqueScore.direction] ??
                    comparison.techniqueScore.direction}
                </span>
              </div>
            </div>

            {comparison.metrics.length > 0 && (
              <div className="mt-2 space-y-2">
                {comparison.metrics.map((metric: MetricComparison) => (
                  <div key={metric.metricId} className="rounded-lg border border-white/[0.06] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-[#A0A2A8]">
                        <span className="font-medium text-[#F5F5F7]">{metric.label}:</span>{" "}
                        {formatNum(metric.previousValue)} → {formatNum(metric.currentValue)}{" "}
                        {metric.unit}{" "}
                        <span className="text-[#6B7280]">
                          ({formatDelta(metric.delta)} {metric.unit})
                        </span>
                      </p>
                      <span className={`${BADGE_BASE} ${badge(DIRECTION_TONE[metric.direction])}`}>
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
        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Coach Summary</h3>
          <p className="text-sm leading-relaxed text-[#A0A2A8]">{report.summary}</p>
        </div>

        {/* Top priorities */}
        <div>
          <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Top Priorities</h3>
          {report.priorities.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No urgent priorities found.</p>
          ) : (
            <div className="space-y-3">
              {report.priorities.map((priority: CoachingPriority) => (
                <div
                  key={priority.id}
                  className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#F5F5F7]">
                      <span className="mr-2 text-[#6B7280]">#{priority.priority}</span>
                      {priority.title}
                    </p>
                    <span className={`${BADGE_BASE} ${badge(IMPACT_TONE[priority.impact])}`}>
                      {priority.impact} impact
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#A0A2A8]">
                    <span className="font-medium text-[#F5F5F7]">Recommendation:</span>{" "}
                    {priority.recommendation}
                  </p>
                  <EvidenceList evidence={priority.evidence} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed coaching */}
        <div>
          <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Detailed Coaching</h3>
          {report.insights.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No detailed insights were generated.</p>
          ) : (
            <div className="space-y-3">
              {report.insights.map((insight: CoachingInsight) => (
                <div
                  key={insight.id}
                  className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#F5F5F7]">{insight.title}</p>
                    <span className={`${BADGE_BASE} ${badge(SEVERITY_TONE[insight.severity])}`}>
                      {insight.severity}
                    </span>
                  </div>
                  <span className={`${BADGE_BASE} mt-2 inline-block ${NEUTRAL_BADGE}`}>
                    {insight.category}
                  </span>
                  <p className="mt-2 text-sm text-[#A0A2A8]">{insight.explanation}</p>
                  <p className="mt-2 text-sm text-[#A0A2A8]">
                    <span className="font-medium text-[#F5F5F7]">Recommendation:</span>{" "}
                    {insight.recommendation}
                  </p>
                  <EvidenceList evidence={insight.evidence} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Raw metric evaluations */}
        <div>
          <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Raw Metric Evaluations</h3>
          {report.metricEvaluations.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No metric evaluations available.</p>
          ) : (
            <div className="space-y-3">
              {report.metricEvaluations.map((metric: MetricEvaluation) => (
                <div
                  key={metric.id}
                  className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#F5F5F7]">{metric.label}</p>
                    <span className={`${BADGE_BASE} ${badge(STATUS_TONE[metric.status])}`}>
                      {metric.status}
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-[#F5F5F7]">
                    {metric.value}
                    <span className="ml-1 text-sm font-medium text-[#6B7280]">{metric.unit}</span>
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    <span className="font-medium text-[#A0A2A8]">Target:</span> {metric.targetRange}
                  </p>
                  <p className="mt-2 text-sm text-[#A0A2A8]">{metric.meaning}</p>
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
      </div>
    </AvaPanel>
  );
}
