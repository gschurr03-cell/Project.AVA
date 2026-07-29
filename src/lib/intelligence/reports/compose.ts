import type { MetricResult } from "@/lib/analysis/resultContract";
import { coachReportInputSchema, coachReportSchema, COACH_REPORT_ENGINE_VERSION, COACH_REPORT_TEMPLATE_VERSION, type CoachReport, type CoachReportInput } from "./contracts";
import { assertSafeReportLanguage } from "./languageSafety";

const metricStatus = (metric: MetricResult): CoachReport["metricHighlights"][number]["status"] =>
  metric.status !== "available" ? (metric.status === "withheld" ? "withheld" : "unavailable")
    : metric.experimental ? "experimental"
      : metric.confidenceLabel === "high" || metric.confidenceLabel === "moderate" ? "trusted" : "limited";

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function composeCoachReport(raw: CoachReportInput): CoachReport {
  const input = coachReportInputSchema.parse(raw);
  const { result, observations, interpretations, recommendations, priorities } = input;
  const analysisIds = [interpretations.analysisId, recommendations.analysisId, priorities.analysisId];
  if (analysisIds.some((id) => id !== result.analysisId))
    throw new Error("Report sources belong to different analyses.");
  if (observations.some((item) => !item.id.includes(`:${result.analysisId}:`)))
    throw new Error("Report observation belongs to a different analysis.");

  const recommendationById = new Map(
    [...recommendations.recommendations, ...recommendations.monitoringRecommendations,
      ...recommendations.preserveRecommendations, ...recommendations.unavailableRecommendations]
      .map((item) => [item.id, item]),
  );
  const topPriorities = priorities.topPriorities.map((priority) => {
    const recommendation = recommendationById.get(priority.recommendationId);
    if (!recommendation) throw new Error(`Missing recommendation ${priority.recommendationId}.`);
    return {
      priorityId: priority.priorityId,
      recommendationId: recommendation.id,
      title: priority.title,
      whyItMatters: priority.whyItMatters,
      action: recommendation.suggestedActions[0] ?? recommendation.summary,
      confidence: priority.confidence,
      expectedImpact: priority.expectedImpact,
      evidence: priority.linkedEvidence.map((item) =>
        item.value == null ? `${item.metric}: unavailable` : `${item.metric}: ${item.value} ${item.unit}`.trim(),
      ),
      monitoring: recommendation.monitoringPlan.successSignal,
    };
  });
  const metrics = result.measurements.map((measurement) => {
    const status = metricStatus(measurement.result);
    return {
      metricId: measurement.metricId, name: measurement.name,
      value: ["trusted", "limited", "experimental"].includes(status) ? measurement.result.value : null,
      unit: measurement.result.unit, phase: measurement.phase, status,
      confidence: measurement.result.confidenceLabel ?? "insufficient",
      reason: measurement.result.reasonCode ?? measurement.result.warning,
      source: `${measurement.result.source}:${measurement.result.version}`,
    };
  });
  const experimental = result.provenance.experimental ||
    observations.some((item) => item.experimental) ||
    interpretations.interpretations.some((item) => item.experimental);
  const availableMetrics = metrics.filter((item) => item.value != null);
  const techniqueFindings = interpretations.interpretations.map((item) => ({
    interpretationId: item.id, title: item.title,
    summary: input.audience === "coach" ? item.explanation : item.summary,
    confidence: item.confidence, evidenceQuality: item.evidenceQuality, phase: item.phase,
  }));
  const unavailable = metrics
    .filter((item) => item.value == null)
    .map((item) => ({ label: item.name, reason: item.reason ?? "The analysis did not support this measurement." }));
  const limitations = unique([
    ...result.warnings,
    ...observations.flatMap((item) => item.limitations.map((value) => value.message)),
    ...interpretations.warnings, ...recommendations.warnings, ...priorities.warnings,
    ...interpretations.unavailableInterpretations.map((item) => item.summary),
  ]);
  const hasTechnique = techniqueFindings.length > 0;
  const hasTiming = metrics.some((item) => item.status === "trusted" && /time|speed|velocity/i.test(item.metricId));
  const status: CoachReport["status"] = experimental ? "experimental"
    : !availableMetrics.length && !hasTechnique ? "insufficient_evidence"
      : hasTechnique && !hasTiming ? "technique_only"
        : hasTiming && !hasTechnique ? "timing_only"
          : limitations.length || !topPriorities.length ? "limited" : "ready";
  const strengths = priorities.supportingStrengths.map((item) => ({
    priorityId: item.priorityId, title: item.title, summary: item.whyItMatters, confidence: item.confidence,
  }));
  const opening = topPriorities.length
    ? `AVA identified ${topPriorities.length} supported ${topPriorities.length === 1 ? "priority" : "priorities"} for this session.`
    : "AVA did not identify a supported action priority from the available evidence.";
  const executiveSummary = [
    opening,
    strengths.length ? `${strengths.length} pattern ${strengths.length === 1 ? "was" : "were"} classified as worth preserving.` : "No preserve-strength conclusion was supported.",
    unavailable.length ? `${unavailable.length} measurement ${unavailable.length === 1 ? "was" : "were"} unavailable or withheld and did not influence the priorities.` : "All displayed metric highlights include their confidence classification.",
    input.audience === "coach"
      ? "Use the linked evidence and monitoring criteria when planning the next compatible capture."
      : "Focus on the first priority, then use the next recording to check whether the pattern changes.",
  ];
  const report: CoachReport = {
    reportId: `${result.analysisId}:${input.audience}:${COACH_REPORT_TEMPLATE_VERSION}`,
    analysisId: result.analysisId, sessionId: result.sessionId, athleteId: result.athleteId,
    audience: input.audience, status, generatedAt: result.provenance.completedAt,
    reportEngineVersion: COACH_REPORT_ENGINE_VERSION,
    templateVersion: COACH_REPORT_TEMPLATE_VERSION,
    sourceVersions: {
      analysis: result.provenance.analysisPipelineVersion,
      observations: observations[0]?.engineVersion ?? "ava-observations-v1",
      interpretations: interpretations.engineVersion,
      recommendations: recommendations.engineVersion,
      priorities: priorities.engineVersion,
    },
    trustBanner: {
      label: experimental ? "Experimental analysis" : status === "ready" ? "Supported report" : "Evidence-limited report",
      summary: result.overallConfidence.rationale ?? "Confidence reflects the weakest required evidence link.",
      experimental,
    },
    executiveSummary, topPriorities, strengths, metricHighlights: metrics,
    techniqueFindings,
    monitoringPlan: unique(topPriorities.map((item) => item.monitoring)),
    nextCapture: unique([
      "Use the same camera position, direction, analysis mode, and calibration setup.",
      "Record at AVA's supported capture frame rate and keep the athlete visible through the analyzed interval.",
      ...topPriorities.map((item) => item.monitoring),
    ]),
    unavailable, limitations,
    methodology: [
      "This report composes AVA's existing measurement, observation, interpretation, recommendation, and priority results.",
      "It does not recalculate biomechanics or introduce new priorities.",
      "Unavailable and withheld values remain null and cannot support a conclusion.",
    ],
    researchEvidence: input.researchEvidence,
    compositionTrace: [
      `measurements:${result.measurements.length}`, `observations:${observations.length}`,
      `interpretations:${interpretations.interpretations.length}`,
      `recommendations:${recommendations.recommendations.length + recommendations.monitoringRecommendations.length}`,
      `priorities:${priorities.topPriorities.length}`,
    ],
  };
  coachReportSchema.parse(report);
  assertSafeReportLanguage(report);
  return report;
}
